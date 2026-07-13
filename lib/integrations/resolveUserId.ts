import { NextRequest } from 'next/server'

/**
 * Resolve the acting user/tenant for an integrations API request.
 *
 * Priority order:
 *   1. x-tenant-id header (server-to-server / curl testing)
 *   2. x-user-id header
 *   3. Cookie-based session (when the browser hits this from the integrations page)
 *   4. Fallback to 'default' so the browser flow never gets a 401
 *
 * Shared by every /api/integrations/oauth/* route so a Composio-connected
 * account is always attributed to the same identity regardless of which
 * endpoint (session/status/connect/revoke) resolved it.
 *
 * When real auth (JWT/session) is wired up, replace the fallback with a
 * proper session lookup and remove the 'default' fallback.
 */
export function resolveUserId(req: NextRequest): string {
  const tenantId = req.headers.get('x-tenant-id')
  if (tenantId && tenantId.trim() !== '') return tenantId.trim()

  const userId = req.headers.get('x-user-id')
  if (userId && userId.trim() !== '') return userId.trim()

  const sessionCookie =
    req.cookies.get('session')?.value ||
    req.cookies.get('next-auth.session-token')?.value ||
    req.cookies.get('__session')?.value
  if (sessionCookie) return sessionCookie

  return 'default'
}
