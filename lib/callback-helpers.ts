/**
 * Callback helpers — pure functions for the OAuth callback route.
 *
 * These are extracted from `app/integrations/callback/route.ts` to satisfy
 * Next.js 14's route handler type-checking, which expects only HTTP method
 * exports (GET, POST, etc.) and rejects other exports.
 *
 * The real `GET` handler in `app/integrations/callback/route.ts` imports and
 * uses these helpers; this module contains only pure, side-effect-free logic
 * so it is independently testable without Composio or a `NextRequest`.
 *
 * Requirements: 5.2, 5.3, 5.4
 */

/**
 * The single enumerated outcome of an OAuth callback.
 *
 *   - `{ status: 'connected', app }` — a successful, identifiable connection.
 *   - `{ status: 'error', reason, app? }` — a provider error, denied
 *     authorization, or a non-active / unidentifiable outcome. `app` is carried
 *     when it can be identified so the page can name the provider.
 */
export type CallbackResult =
  | { status: 'connected'; app: string }
  | { status: 'error'; reason: string; app?: string }

/**
 * The set of failure `reason` codes the integrations page understands (plus the
 * callback-only `not_active`). `classifyCallbackParams` emits a reason from this
 * set whenever the provider error can be recognized; unrecognized provider
 * errors are passed through as a sanitized slug so the page can fall back to its
 * generic "OAuth error: <reason>" message.
 *
 * The page (`app/integrations/page.tsx`) maps `invalid_state`, `access_denied`,
 * and `token_exchange_failed` to friendly messages today.
 */
const KNOWN_ERROR_REASONS = [
  'access_denied',
  'token_exchange_failed',
  'invalid_state',
  'unauthorized',
  'not_active',
] as const

/**
 * Composio lifecycle statuses that, when present on the callback, indicate the
 * connection did not finalize successfully. Compared case-insensitively.
 *
 * Note: `INITIATED` and unknown/empty statuses are intentionally NOT treated as
 * failures here — they are classified as success (when an app is identifiable)
 * and verified by the best-effort reconciliation step in the GET handler, which
 * downgrades to `not_active` if the account is not `ACTIVE`.
 */
const FAILURE_STATUSES = new Set([
  'FAILED',
  'EXPIRED',
  'ERROR',
  'DENIED',
  'REVOKED',
  'CANCELLED',
  'CANCELED',
  'INACTIVE',
])

/** True when `value` is a non-empty string after trimming. */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

/**
 * Normalize a provider app identifier into the slug shape the rest of the
 * integration uses (`appName.toLowerCase().replace(/\s+/g, '-')`, mirroring the
 * `oauth?action=status` mapping). Returns `undefined` when no usable value.
 */
function normalizeAppId(value: string | null): string | undefined {
  if (!isNonEmptyString(value)) return undefined
  const slug = value.trim().toLowerCase().replace(/\s+/g, '-')
  return slug === '' ? undefined : slug
}

/**
 * Identify the connected app from the callback params, trying the keys Composio
 * commonly returns in order: `appName`, then `app`, then `integrationId`.
 */
function identifyApp(params: URLSearchParams): string | undefined {
  return (
    normalizeAppId(params.get('appName')) ??
    normalizeAppId(params.get('app')) ??
    normalizeAppId(params.get('integrationId'))
  )
}

/**
 * Map a provider error (`error` / `error_description`) onto a `reason` code.
 * Prefers the structured `error` code; recognized OAuth 2.0 error codes and the
 * known reasons collapse onto {@link KNOWN_ERROR_REASONS}. An unrecognized but
 * present `error` code is passed through as a sanitized slug. When no `error`
 * code is present (only an `error_description`), defaults to `access_denied`.
 */
function mapErrorReason(error: string | null): string {
  const code = isNonEmptyString(error)
    ? error.trim().toLowerCase().replace(/\s+/g, '_')
    : ''

  if (code === '') {
    // Only a human-readable description was supplied (no machine code), or an
    // empty error — treat as a denied authorization.
    return 'access_denied'
  }

  if ((KNOWN_ERROR_REASONS as readonly string[]).includes(code)) {
    return code
  }

  switch (code) {
    case 'denied':
    case 'user_denied':
    case 'consent_required':
    case 'interaction_required':
    case 'login_required':
      return 'access_denied'
    case 'invalid_request':
    case 'state_mismatch':
    case 'invalid_scope':
      return 'invalid_state'
    case 'invalid_grant':
    case 'invalid_client':
    case 'unauthorized_client':
    case 'unsupported_grant_type':
    case 'server_error':
    case 'temporarily_unavailable':
      return 'token_exchange_failed'
    default:
      // Unrecognized provider error — pass the sanitized slug through; the page
      // degrades gracefully to its generic "OAuth error: <reason>" message.
      return code
  }
}

/** Build an error-shaped `CallbackResult`, attaching `app` only when known. */
function errorResult(reason: string, app: string | undefined): CallbackResult {
  return app ? { status: 'error', reason, app } : { status: 'error', reason }
}

/**
 * Pure: derive the {@link CallbackResult} from Composio's query params alone.
 *
 * Composio commonly returns `status`, `connectedAccountId`, an app identifier
 * (`appName | app | integrationId`), and — on failure — `error` /
 * `error_description`. Classification precedence:
 *
 *   1. A provider error (`error` or `error_description` present) → `error` with
 *      a mapped `reason`.
 *   2. An unidentifiable outcome (no resolvable app) → `error` (`not_active`).
 *   3. An explicit non-active `status` (FAILED / EXPIRED / DENIED / …) →
 *      `error` (`not_active`), carrying the identified app.
 *   4. Otherwise (identifiable app, no error, `status` ACTIVE / unknown /
 *      empty) → `connected`.
 *
 * Per the design, an unknown/empty `status` with no error is treated as success
 * when an app is identifiable; the GET handler's best-effort reconciliation
 * verifies the account is actually `ACTIVE` and downgrades to `not_active`
 * when it is not.
 *
 * Requirements: 5.2, 5.3
 */
export function classifyCallbackParams(params: URLSearchParams): CallbackResult {
  const app = identifyApp(params)

  // 1. Provider error / denied authorization takes precedence.
  const error = params.get('error')
  const errorDescription = params.get('error_description')
  if (isNonEmptyString(error) || isNonEmptyString(errorDescription)) {
    return errorResult(mapErrorReason(error), app)
  }

  // 2. No identifiable app → unidentifiable outcome.
  if (!app) {
    return errorResult('not_active', undefined)
  }

  // 3. Explicit non-active lifecycle status → failure.
  const status = String(params.get('status') ?? '').trim().toUpperCase()
  if (FAILURE_STATUSES.has(status)) {
    return errorResult('not_active', app)
  }

  // 4. Successful, identifiable connection.
  return { status: 'connected', app }
}

/**
 * Pure: build the single redirect URL back to the integrations page.
 *
 * Targets the `/integrations` path and uses ONLY the query keys the page
 * already handles — `connected` for success, and `error` (plus optional
 * `provider`) for failure. Values are URL-encoded via `URLSearchParams`, so no
 * other keys can leak into the redirect.
 *
 * When `base` is a valid absolute URL its origin is preserved (and any existing
 * query/hash is discarded); otherwise an absolute `/integrations` path with the
 * query string is returned.
 *
 * Requirements: 5.4
 */
export function buildIntegrationsRedirect(result: CallbackResult, base: string): string {
  const query = new URLSearchParams()
  if (result.status === 'connected') {
    query.set('connected', result.app)
  } else {
    query.set('error', result.reason)
    if (isNonEmptyString(result.app)) {
      query.set('provider', result.app)
    }
  }

  const qs = query.toString()

  try {
    const url = new URL(base)
    url.pathname = '/integrations'
    url.search = qs
    url.hash = ''
    return url.toString()
  } catch {
    // `base` is not a valid absolute URL — return the absolute path on its own.
    return qs ? `/integrations?${qs}` : '/integrations'
  }
}