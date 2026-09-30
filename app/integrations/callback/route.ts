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
import { getComposioClient, getComposioRedirectUrl } from '@/lib/composio'
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
 * (`connectedAccounts.get(connectedAccountId)`) and downgrades to
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
  params: URLSearchParams
): Promise<CallbackResult> {
  const classified = classifyCallbackParams(params)

  // Composio v3 sends `connected_account_id`; `connectedAccountId` is the old spelling.
  const connectedAccountId = params.get('connected_account_id') ?? params.get('connectedAccountId')
  if (!isNonEmptyString(connectedAccountId)) return classified

  // A provider error / denial stays exactly as classified. Without an app the
  // param-based result is `not_active`, which we try to repair below by asking
  // Composio which toolkit this account belongs to.
  const appUnknown = classified.status === 'error' && classified.reason === 'not_active' && !classified.app
  if (classified.status === 'error' && !appUnknown) return classified

  try {
    const composio = getComposioClient()
    // `@composio/core` v0.13 exposes connected accounts via
    // `composio.connectedAccounts.get(id)`.
    // The account can still read INITIATED for a moment after the redirect, so
    // give it a few short chances to turn ACTIVE before calling it a failure.
    let status = ''
    let slug = ''
    for (let attempt = 0; attempt < 5; attempt++) {
      const account = (await composio.connectedAccounts.get(connectedAccountId.trim())) as
        | { status?: unknown; toolkit?: { slug?: unknown } | null }
        | null
        | undefined
      status = String(account?.status ?? '').trim().toUpperCase()
      slug = String(account?.toolkit?.slug ?? '').trim().toLowerCase()
      if (status === 'ACTIVE' || status === 'FAILED' || status === 'EXPIRED') break
      await new Promise((resolve) => setTimeout(resolve, 800))
    }

    const app = classified.status === 'connected' ? classified.app : slug || undefined
    if (status !== 'ACTIVE') {
      return app ? { status: 'error', reason: 'not_active', app } : { status: 'error', reason: 'not_active' }
    }
    return app ? { status: 'connected', app } : classified
  } catch {
    // Best-effort: any lookup failure keeps the param-based result.
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
  // Do not derive the public redirect from the container's request origin.
  // Behind Traefik this can be `http://0.0.0.0:9001`; use the same explicit
  // public callback URL registered with Composio instead. It also preserves
  // Next's `/dashboard` base path when returning to the page.
  const base = getComposioRedirectUrl()

  // 1. Gate the callback. On AuthError, redirect (do NOT return JSON) and
  //    perform no Composio work.
  const auth = await resolveIntegrationUser(req)
  if (!auth.ok) {
    const result: CallbackResult = { status: 'error', reason: 'unauthorized' }
    return NextResponse.redirect(buildIntegrationsRedirect(result, base))
  }

  // 2. Classify the callback params and best-effort reconcile against Composio.
  const outcome = await resolveCallbackOutcome(req.nextUrl.searchParams)

  // 3. Exactly one redirect back to the integrations page.
  return NextResponse.redirect(buildIntegrationsRedirect(outcome, base))
}
