/**
 * Composio SDK client — server-side only.
 *
 * Migrated from composio-core (v1 API — retired 2026-07-03, returns HTTP 410
 * on every call) to @composio/core (v3). Key API shape changes:
 *   - composio.getEntity(userId).getConnections()
 *       -> composio.connectedAccounts.list({ userIds: [userId] })  (returns { items }, not a bare array)
 *   - entity.initiateConnection({ appName, redirectUri })
 *       -> composio.connectedAccounts.link(userId, authConfigId, { callbackUrl })
 *          (`initiate()` still exists but throws for Composio-managed OAuth
 *          post-2026-07-03; `link()` is the documented replacement)
 *   - composio.connectedAccounts.delete({ connectedAccountId })
 *       -> composio.connectedAccounts.delete(connectedAccountId)  (positional string, not an object)
 *   - "appName" is now "toolkit.slug" on every response object
 *   - v3 requires an authConfigId to open a connection — see
 *     {@link getOrCreateAuthConfigId}, which auto-provisions a
 *     Composio-managed auth config per toolkit so no manual dashboard
 *     setup or bring-your-own OAuth app credentials are needed.
 *
 * Usage:
 *   import { getComposioClient, getOrCreateAuthConfigId } from '@/lib/composio'
 *   const composio = getComposioClient()
 *   const { items } = await composio.connectedAccounts.list({ userIds: [userId] })
 *
 * Environment variables required:
 *   COMPOSIO_API_KEY          — Composio API key
 *   COMPOSIO_REDIRECT_URL     — OAuth redirect URL (optional override)
 */

import { Composio } from '@composio/core'

/**
 * Stable sentinel token that prefixes the "Composio is not configured" error
 * message thrown by {@link getComposioClient}. Routes detect the not-configured
 * case via {@link isComposioConfigError} instead of substring-matching env
 * values, and no environment value is ever embedded in the thrown message.
 */
export const COMPOSIO_NOT_CONFIGURED = 'COMPOSIO_NOT_CONFIGURED'

let _client: Composio | null = null

export function getComposioClient(): Composio {
  if (!_client) {
    const apiKey = process.env.COMPOSIO_API_KEY
    if (!apiKey) {
      // Message begins with a stable token and contains no env value.
      throw new Error(`${COMPOSIO_NOT_CONFIGURED}: Composio is not configured`)
    }
    _client = new Composio({ apiKey })
  }
  return _client
}

/**
 * Detects the "Composio is not configured" sentinel error thrown by
 * {@link getComposioClient}. Matches on the stable token prefix only — it never
 * inspects or substring-matches the value of any environment variable.
 */
export function isComposioConfigError(err: unknown): boolean {
  if (err instanceof Error) {
    return err.message.startsWith(COMPOSIO_NOT_CONFIGURED)
  }
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const message = (err as { message: unknown }).message
    return typeof message === 'string' && message.startsWith(COMPOSIO_NOT_CONFIGURED)
  }
  return false
}

/** The OAuth redirect URL sent to Composio when initiating a connection. */
export function getComposioRedirectUrl(): string {
  return (
    process.env.COMPOSIO_REDIRECT_URL ||
    `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/integrations/callback`
  )
}

// In-process cache of toolkit slug -> auth config id, so we don't call
// authConfigs.list/create on every connect click. Fine to lose on restart —
// worst case is one extra list+maybe-create round trip.
const _authConfigCache = new Map<string, string>()

/**
 * Resolve the Composio auth config id for a toolkit (e.g. 'slack', 'gmail'),
 * creating a Composio-managed one on first use if none exists yet.
 *
 * v3 requires every connectedAccounts.link()/initiate() call to reference an
 * auth config id — there is no more "just pass the app name" shortcut. Rather
 * than requiring auth configs to be pre-created in the Composio dashboard (or
 * bringing our own per-app OAuth credentials), authConfigs.create(toolkit)
 * defaults to `{ type: 'use_composio_managed_auth' }`, which provisions a
 * Composio-hosted OAuth app for that toolkit automatically.
 */
export async function getOrCreateAuthConfigId(
  composio: Composio,
  toolkitSlug: string
): Promise<string> {
  const cached = _authConfigCache.get(toolkitSlug)
  if (cached) return cached

  const existing = await composio.authConfigs.list({ toolkit: toolkitSlug })
  const existingId = existing.items[0]?.id
  if (existingId) {
    _authConfigCache.set(toolkitSlug, existingId)
    return existingId
  }

  const created = await composio.authConfigs.create(toolkitSlug)
  _authConfigCache.set(toolkitSlug, created.id)
  return created.id
}
