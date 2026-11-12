/**
 * Workspace API authZ shared by the /api/workspace routes.
 *
 * Two credential kinds are accepted, mirroring what aivory-collab verifies:
 *   - user: an HS256 JWT (Bearer header or the aivory_access_token /
 *     aivory_session_token cookies). The same token is forwarded to collab so
 *     IT enforces per-doc RBAC; the dashboard only gates the endpoint.
 *   - service: `X-Service-Token` equal to COLLAB_SERVICE_TOKEN. Used by
 *     agent-originated, server-side calls (Cerveau → dashboard). Client
 *     asserted `X-Agent-Type` is NEVER trusted here — collab only honours it
 *     when the request also carries the service token.
 *
 * When collab is unreachable the legacy pg fallback must NOT silently bypass
 * authZ, so `authorizeDocFallback` re-checks ownership before serving pg rows.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAuthUserWithToken, type AuthUser } from '@/lib/serverAuth'
import { query } from '@/lib/db'
import { requirePaidPlan } from '@/lib/planGate'

export type WorkspaceCredential =
  | { kind: 'user'; user: AuthUser; token: string }
  | { kind: 'service'; token: string }

/** Resolve the caller's workspace credential, or null when unauthenticated. */
export function workspaceCredential(request: NextRequest): WorkspaceCredential | null {
  const serviceToken = process.env.COLLAB_SERVICE_TOKEN
  const supplied = request.headers.get('x-service-token')
  if (serviceToken && supplied && supplied === serviceToken) {
    return { kind: 'service', token: supplied }
  }
  const authed = getAuthUserWithToken(request)
  if (authed) return { kind: 'user', user: authed.user, token: authed.token }
  return null
}

/**
 * Paid-plan check for a workspace caller: null = allowed, otherwise the
 * response to send (402 UPGRADE_REQUIRED for a free account, 403 when a team
 * didn't grant `module`, 401/503 per lib/planGate). Service-token calls are
 * server-to-server (Cerveau agents, which avry-backend already gates by
 * plan) and carry no user, so they pass.
 */
export async function workspacePlanDenied(
  request: NextRequest,
  cred: WorkspaceCredential,
  module: string = 'workspace',
): Promise<NextResponse | null> {
  if (cred.kind === 'service') return null
  const gate = await requirePaidPlan(request, module)
  return gate.ok ? null : gate.response
}

/** Headers to forward to aivory-collab so it enforces its own per-doc RBAC. */
export function collabAuthHeaders(cred: WorkspaceCredential): Record<string, string> {
  return cred.kind === 'service'
    ? { 'X-Service-Token': cred.token }
    : { Authorization: `Bearer ${cred.token}` }
}

/**
 * Coarse fallback check used ONLY when collab is unreachable (pg fallback).
 * Collab remains the authoritative per-doc RBAC enforcer while it is up; this
 * re-checks ownership from the legacy pg row so a collab outage can't turn
 * into an authorization bypass. New/ownerless docs fall back open (the first
 * authorized writer claims them) to match collab's own new-doc rule.
 */
export async function authorizeDocFallback(
  cred: WorkspaceCredential,
  id: string,
): Promise<boolean> {
  if (cred.kind === 'service') return true
  if (cred.user.account_type === 'admin' || cred.user.account_type === 'superadmin') return true
  try {
    // Must match every id form a doc can be stored under (bare, workspace:,
    // workspace:db:, db: — see app/api/workspace/[id]/route.ts's delete/restore
    // for the same 4-form list). Checking only 2 forms let a database-type doc
    // (`workspace:db:{id}`) read back as "0 rows" during a collab outage and
    // fail OPEN — an existing, owned doc getting treated as brand new and
    // claimable by whoever asked.
    const r = await query(
      'SELECT owner FROM dashboard.workspace_docs WHERE id = ANY($1::text[])',
      [[id, `workspace:${id}`, `workspace:db:${id}`, `db:${id}`]],
    )
    if (r.rows.length === 0) return true // new doc — first writer claims owner
    return r.rows.some((row) => row.owner === cred.user.user_id)
  } catch {
    return false
  }
}

export function unauthorized() {
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
}

export function forbidden() {
  return NextResponse.json({ error: 'forbidden' }, { status: 403 })
}