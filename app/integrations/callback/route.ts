/**
 * app/integrations/callback/route.ts
 *
 * The OAuth callback route handler that Composio redirects the user back to
 * after they authorize (or deny) a provider. The configured `Redirect_Url`
 * (`COMPOSIO_REDIRECT_URL`) targets this `/integrations/callback` path.
 *
 * A route handler (not a page) is the right tool: the redirect target is a pure
 * server concern, and a `GET` handler that returns `NextResponse.redirect(...)` 
 * performs exactly one 302 with no client render in between (Requirement 5.5).
 * It coexists with `app/integrations/page.tsx` because `callback` is a distinct
 * child segment.
 *
 * This module exports ONLY the `GET` handler to satisfy Next.js 14's route
 * handler type-checking, which expects only HTTP method exports (GET, POST,
 * etc.) and rejects other exports. The pure helpers are in `lib/callback-helpers.ts`.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 3.5, 10.1, 10.5
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveIntegrationUser } from '@/lib/integration-auth'
import { getComposioClient } from '@/lib/composio'
import {
  classifyCallbackParams,
  buildIntegrationsRedirect,
  type CallbackResult,
} from '@/lib/callback-helpers'

/**
 * Best-effort, side-effecting resolution of the callback outcome.
 *
 * Starts from the pure {@link classifyCallbackParams} classification. When a
 * `connectedAccountId` param is present AND the param-based classification is
 * `connected`, it **reconciles** against Composio by reading the actual account
 * (`entity(userId).getConnection({ connectedAccountId })`) and downgrades to
 * `{ status: 'error', reason: 'not_active', app }` when the account's lifecycle
 * status is not `ACTIVE`.
 *
 * The reconciliation is strictly best-effort: if the Composio call throws (or
 * the client is not configured), the original param-based classification stands
 * — the redirect is NEVER allowed to crash (Requirement 5.5).
 *
 * Requirements: 5.2, 5.3, 5.5, 6.2
 */
async function resolveCallbackOutcome(
  params: URLSearchParams,
  userId: string
): Promise<CallbackResult> {
  const classified = classifyCallbackParams(params)

  const connectedAccountId = params.get('connectedAccountId')

  // Only reconcile a param-based success that carries an account id to verify.
  if (classified.status !== 'connected' || !isNonEmptyString(connectedAccountId)) {
    return classified
  }

  try {
    const composio = getComposioClient()
    const entity = composio.getEntity(userId)
    const account = await entity.getConnection({
      connectedAccountId: connectedAccountId.trim(),
    })

    const status = String(
      (account as { status?: unknown } | null | undefined)?.status ?? ''
    )
      .trim()
      .toUpperCase()

    // Downgrade a non-ACTIVE account to a not_active error, preserving the app.
    if (status !== 'ACTIVE') {
      return { status: 'error', reason: 'not_active', app: classified.app }
    }

    return classified
  } catch {
    // Best-effort: any reconciliation failure keeps the param-based result.
    // The redirect must never crash (Requirement 5.5).
    return classified
  }
}

/** True when `value` is a non-empty string after trimming. */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

/**
 * OAuth callback GET handler.
 *
 * Composio redirects the user here after they authorize (or deny) a provider.
 * The handler:
 *   1. Gates the request via `resolveIntegrationUser` (the callback is an
 *      Integration_API endpoint — Requirement 3.5). Unlike the JSON routes,
 *      callback errors are surfaced as a REDIRECT, not a JSON `Error_Contract`:
 *      an `AuthError` becomes `/integrations?error=unauthorized`.
 *   2. Resolves the outcome from the callback params plus best-effort Composio
 *      reconciliation (`resolveCallbackOutcome`).
 *   3. Issues EXACTLY ONE redirect back to `/integrations` (Requirement 5.5),
 *      using only the `connected | error | provider` query keys the page
 *      handles (Requirement 5.4).
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 3.5, 10.1, 10.5
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  // The origin to build an absolute redirect against. `nextUrl` is preferred;
  // `url` is a robust fallback. `buildIntegrationsRedirect` degrades gracefully
  // to a relative `/integrations` path if neither yields a valid absolute URL.
  const base = req.nextUrl?.origin ?? req.url

  // 1. Gate the callback. On AuthError, redirect (do NOT return JSON) and
  //    perform no Composio work.
  const auth = resolveIntegrationUser(req)
  if (!auth.ok) {
    const result: CallbackResult = { status: 'error', reason: 'unauthorized' }
    return NextResponse.redirect(buildIntegrationsRedirect(result, base))
  }

  // 2. Classify the callback params and best-effort reconcile against Composio.
  const outcome = await resolveCallbackOutcome(req.nextUrl.searchParams, auth.userId)

  // 3. Exactly one redirect back to the integrations page.
  return NextResponse.redirect(buildIntegrationsRedirect(outcome, base))
}