/**
 * Proves to the VPS bridge which user a server-side call is made for.
 *
 * The bridge has no request authentication and is reachable on its port, so a
 * `user_id` in a request body is only a claim. These headers carry the user id
 * from the verified JWT together with a shared secret (BRIDGE_CALLER_TOKEN, the
 * same value in the bridge's env); only a request with the right secret is
 * treated as that user, and only then does the bridge run a call on the user's
 * own provider key (BYOK). Without the env var nothing is sent and the call
 * behaves exactly as before: Aivory's key.
 *
 * Server-only: never import this from a client component.
 */
import type { NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/serverAuth'

export function bridgeCallerHeaders(userId: string | undefined | null): Record<string, string> {
  const secret = process.env.BRIDGE_CALLER_TOKEN
  if (!secret || !userId) return {}
  return { 'X-Aivory-Caller': secret, 'X-Aivory-User': userId }
}

/**
 * Same headers, taking the user from the request's own verified JWT. For routes
 * whose plan/run gate doesn't hand back the user. An unauthenticated or
 * unverifiable request simply gets none (the gate has already refused it).
 */
export function bridgeCallerHeadersFor(request: NextRequest): Record<string, string> {
  try {
    return bridgeCallerHeaders(getAuthUser(request)?.user_id)
  } catch {
    return {}
  }
}
