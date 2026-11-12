/**
 * Feature gating for people who use the dashboard only through a team.
 *
 * Someone with their own live plan (or a platform/demo account) is never
 * restricted here: their access is their own. Someone with NO plan of their
 * own who sits in at least one team gets exactly the union of the modules the
 * team admins granted them. Everyone else (no plan, no team) is untouched, so
 * existing plan gates keep deciding.
 *
 * SERVER-ONLY (reads identity.user_tiers + dashboard.workspace_members).
 */
import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requirePaidPlan } from '@/lib/planGate'
import { effectiveModules } from '@/lib/workspaceModules'
import { LEGACY_WORKSPACE } from '@/lib/teams'

export interface TeamAccess {
  restricted: boolean
  /** Granted module keys; only meaningful when `restricted`. */
  modules: string[]
}

const OPEN: TeamAccess = { restricted: false, modules: [] }

/** Pure: fold a user's memberships into one access decision. */
export function resolveTeamAccess(
  hasOwnPlan: boolean,
  memberships: { role: string; modules: string[] | null }[],
): TeamAccess {
  if (hasOwnPlan || memberships.length === 0) return OPEN
  const union = new Set<string>()
  for (const m of memberships) for (const k of effectiveModules(m.role, m.modules)) union.add(k)
  return { restricted: true, modules: Array.from(union) }
}

/** Throws on DB errors; callers decide whether to fail open or closed. */
export async function teamAccessFor(userId: string, accountType?: string | null): Promise<TeamAccess> {
  if (accountType === 'admin' || accountType === 'superadmin' || accountType === 'demo') return OPEN
  const [plan, mem] = await Promise.all([
    query(
      `SELECT 1 FROM identity.user_tiers WHERE user_id = $1 AND (expires_at IS NULL OR expires_at > now()) LIMIT 1`,
      [userId],
    ),
    query(
      `SELECT role, modules FROM dashboard.workspace_members WHERE user_id = $1 AND workspace_id <> $2`,
      [userId, LEGACY_WORKSPACE],
    ),
  ])
  return resolveTeamAccess(
    (plan.rowCount ?? 0) > 0,
    mem.rows.map((r) => ({ role: String(r.role), modules: (r.modules as string[] | null) ?? null })),
  )
}

/**
 * API-route guard for a paid module: null = allowed, otherwise the response to
 * return (401 not signed in, 402 no paid plan, 403 module not granted by the
 * team, 503 plan check unavailable). This used to pass unauthenticated and
 * planless callers through, trusting a browser-side redirect to keep them
 * out; the decision now lives on the server and fails closed. See
 * `lib/planGate.ts`.
 */
export async function requireModule(req: NextRequest, key: string): Promise<NextResponse | null> {
  const gate = await requirePaidPlan(req, key)
  return gate.ok ? null : gate.response
}
