/**
 * lib/integration-errors.ts
 *
 * Shared `Error_Contract` builder for the Composio Integration_API routes.
 *
 * Every JSON error response across the integration endpoints uses the single
 * structured shape `{ error: { code, message, details? } }` with an
 * appropriate HTTP status, so no route emits a raw 500 (Requirement 10.4).
 *
 * The helper accepts either an `AuthError` returned by `resolveIntegrationUser`
 * (which already carries `status`, `code`, and `message`) or an explicit
 * `{ status, code, message, details? }` object, and serializes the contract.
 * `details` is included only when present and must already be a diagnostic,
 * non-secret string (never `process.env` values) so Property 11 holds.
 *
 * Server-only: returns a `NextResponse`.
 *
 * Requirements: 10.1, 10.4, 10.5
 */

import { NextResponse } from 'next/server'
import type { AuthError } from '@/lib/integration-auth'

/** The recognized `Error_Contract` codes emitted by the integration routes. */
export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'BAD_REQUEST'
  | 'COMPOSIO_ERROR'

/** An explicit error intent for `errorResponse` (non-auth callers). */
export interface ErrorContractInput {
  status: number
  code: ErrorCode
  message: string
  /** Optional diagnostic string. Must never contain a secret/env value. */
  details?: string
}

/**
 * The server secrets that must NEVER appear in any response body. `details` is
 * frequently derived from a thrown SDK error's `message`, which can embed the
 * Composio API key (e.g. "provided apiKey \"sk-…\" was rejected"). Before any
 * `details` string is serialized it is scrubbed of every configured secret
 * value so the secret can never leak (Requirements 7.1, 10.5).
 *
 * Env var names are listed here (not values) so the list is auditable; the
 * actual values are read at call time from `process.env`.
 */
const SECRET_ENV_VARS = [
  'COMPOSIO_API_KEY',
  'COMPOSIO_WEBHOOK_SECRET',
] as const

/** The literal substituted in place of a redacted secret value. */
const REDACTION_PLACEHOLDER = '[REDACTED]'

/** Escape a string for safe use inside a `RegExp` literal. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Redact any configured server-secret value occurring in `details`. Reads the
 * secret values from `process.env` at call time and replaces every occurrence
 * with {@link REDACTION_PLACEHOLDER}. Returns the scrubbed string (or the
 * original when no secret is configured / present).
 */
export function redactSecrets(details: string): string {
  let scrubbed = details
  for (const name of SECRET_ENV_VARS) {
    const value = process.env[name]
    // Skip unset/empty/trivially short values to avoid pathological replaces.
    if (typeof value === 'string' && value.length >= 4) {
      scrubbed = scrubbed.replace(
        new RegExp(escapeRegExp(value), 'g'),
        REDACTION_PLACEHOLDER,
      )
    }
  }
  return scrubbed
}

/**
 * Build a structured `Error_Contract` `NextResponse`.
 *
 * `details` is emitted only when defined, keeping success-shaped contracts
 * minimal, and is ALWAYS scrubbed of configured server secrets via
 * {@link redactSecrets} before serialization. The body is always
 * `{ error: { code, message, details? } }`.
 */
export function errorResponse(input: AuthError | ErrorContractInput): NextResponse {
  const { status, code, message } = input
  const rawDetails =
    'details' in input && typeof input.details === 'string'
      ? input.details
      : undefined
  const details = rawDetails !== undefined ? redactSecrets(rawDetails) : undefined

  const error =
    details !== undefined ? { code, message, details } : { code, message }

  return NextResponse.json({ error }, { status })
}
