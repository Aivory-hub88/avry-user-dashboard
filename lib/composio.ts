/**
 * Composio SDK client — server-side only.
 *
 * Usage:
 *   import { getComposioClient } from '@/lib/composio'
 *   const composio = getComposioClient()
 *   const entity   = composio.getEntity(userId)
 *   const conns    = await entity.getConnections()
 *
 * Environment variables required:
 *   COMPOSIO_API_KEY          — Composio API key
 *   COMPOSIO_REDIRECT_URL     — OAuth redirect URL (optional override)
 */

import { Composio } from 'composio-core'

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
