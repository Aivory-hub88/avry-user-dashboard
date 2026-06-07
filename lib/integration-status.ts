/**
 * lib/integration-status.ts
 *
 * Server-safe, pure source of truth for mapping a raw Composio connection's
 * lifecycle state to the normalized `ConnectionStatus` used by the dashboard.
 *
 * Both `action=session` and `action=status` in the integration routes import
 * this single function so the mapping cannot drift between endpoints.
 *
 * No `'use client'` directive and no browser globals — safe to import from
 * server route handlers.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4
 */

import type { ConnectionStatus } from '@/types/integrations'

/**
 * The raw fields read off a Composio `ConnectionItem` / connected-account
 * response that determine the normalized status.
 *
 * `status` is the lifecycle string (e.g. INITIATED | ACTIVE | FAILED | EXPIRED)
 * and is compared case-insensitively. `enabled`/`isDisabled` capture whether an
 * otherwise-ACTIVE account is currently usable; `deleted` marks a revoked
 * connection.
 */
export interface RawComposioConnection {
  status: string
  enabled?: boolean
  isDisabled?: boolean
  deleted?: boolean
}

/**
 * Total function mapping a raw Composio connection to exactly one of
 * `connected | revoked | needs_reauth`.
 *
 * Mapping rules (in precedence order):
 *   - `deleted === true`                                    → `revoked`
 *   - `ACTIVE` and usable (`enabled !== false`
 *     and `isDisabled !== true`)                            → `connected`
 *   - `ACTIVE` but not usable (`enabled === false`
 *     or `isDisabled === true`)                             → `needs_reauth`  (best-effort)
 *   - `EXPIRED`                                             → `needs_reauth`
 *   - `INITIATED` / `FAILED` / unknown                      → `needs_reauth`  (safe default)
 *
 * The status string is compared case-insensitively.
 */
export function mapConnectionStatus(c: RawComposioConnection): ConnectionStatus {
  // A deleted connection is revoked, regardless of its reported lifecycle state.
  if (c.deleted === true) {
    return 'revoked'
  }

  const status = String(c.status ?? '').trim().toUpperCase()

  if (status === 'ACTIVE') {
    // ACTIVE but flagged non-functional → best-effort needs_reauth.
    if (c.enabled === false || c.isDisabled === true) {
      return 'needs_reauth'
    }
    return 'connected'
  }

  // EXPIRED, INITIATED, FAILED, and any unknown state fall through to a safe
  // default that lets the user reconnect.
  return 'needs_reauth'
}
