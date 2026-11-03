/**
 * Who may touch a workflow. Ownership is the CREATOR (a superadmin's own
 * workflows stay theirs). Customers see their own plus those shared into a
 * team they belong to. Workflows saved before ownership existed have no
 * creator on record and belong to the superadmin. Tenant admin (team owner)
 * and Aivory staff are different things: staff get no access to a customer's
 * workflows.
 *
 * SERVER-ONLY.
 */
import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getAuthUser } from '@/lib/serverAuth'
import { LEGACY_WORKSPACE } from '@/lib/teams'
import { memberCanUse } from '@/lib/workspaceModules'
import { workflowRepository } from '@/lib/workflows/repository'
import type { AivoryWorkflowSpec } from '@/types/workflow'

export type WorkflowAccess = 'owner' | 'editor' | 'viewer' | null
export type Need = 'read' | 'write' | 'delete'

export interface Membership {
  role: string
  modules: string[] | null
}

export interface WorkflowActor {
  userId: string
  /** account_type === 'superadmin' (the Aivory owner), not tenant admins or staff admins. */
  superadmin: boolean
  memberships: Map<string, Membership>
}

export function isSuperadmin(accountType?: string | null): boolean {
  return accountType === 'superadmin'
}

/** Pure. */
export function resolveWorkflowAccess(
  spec: Pick<AivoryWorkflowSpec, 'owner' | 'workspace_id'>,
  actor: WorkflowActor,
): WorkflowAccess {
  if (spec.owner && spec.owner === actor.userId) return 'owner'
  if (!spec.owner && actor.superadmin) return 'owner' // legacy, creator unknown
  const m = spec.workspace_id ? actor.memberships.get(spec.workspace_id) : undefined
  if (!m || !memberCanUse(m.role, m.modules, 'workflows')) return null
  return m.role === 'owner' ? 'owner' : m.role === 'editor' ? 'editor' : 'viewer'
}

export function allows(access: WorkflowAccess, need: Need): boolean {
  if (access === null) return false
  if (need === 'read') return true
  if (need === 'write') return access === 'owner' || access === 'editor'
  return access === 'owner'
}

/** Teams the user owns or belongs to, with their role and feature grants. */
export async function loadActor(userId: string, accountType?: string | null): Promise<WorkflowActor> {
  const memberships = new Map<string, Membership>()
  try {
    const r = await query(
      `SELECT w.id AS workspace_id, 'owner' AS role, NULL::text[] AS modules
         FROM dashboard.workspaces w WHERE w.owner = $1 AND w.id <> $2
       UNION ALL
       SELECT m.workspace_id, m.role, m.modules
         FROM dashboard.workspace_members m WHERE m.user_id = $1 AND m.workspace_id <> $2`,
      [userId, LEGACY_WORKSPACE],
    )
    for (const row of r.rows) {
      const id = String(row.workspace_id)
      // owner wins over a duplicate member row
      if (!memberships.has(id) || row.role === 'owner')
        memberships.set(id, { role: String(row.role), modules: (row.modules as string[] | null) ?? null })
    }
  } catch (e) {
    console.error('[workflows/access] memberships', e) // fail closed on team access: own workflows only
  }
  return { userId, superadmin: isSuperadmin(accountType), memberships }
}

export type Authorized =
  | { ok: true; actor: WorkflowActor; spec: AivoryWorkflowSpec | undefined }
  | { ok: false; res: NextResponse }

/**
 * Gate for any route keyed by a workflow id. A workflow the server has no
 * record of (client-only until now) passes through with `spec: undefined` so
 * existing create-on-first-write flows keep working; the route stamps the
 * owner when it creates the record.
 */
export async function authorizeWorkflow(req: NextRequest, id: string, need: Need): Promise<Authorized> {
  let user
  try {
    user = getAuthUser(req)
  } catch {
    user = null
  }
  if (!user) return { ok: false, res: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }
  const actor = await loadActor(user.user_id, user.account_type)
  const spec = workflowRepository.get(id)
  if (spec && !allows(resolveWorkflowAccess(spec, actor), need))
    // 404, not 403: don't confirm another customer's workflow exists.
    return { ok: false, res: NextResponse.json({ error: 'Workflow not found' }, { status: 404 }) }
  return { ok: true, actor, spec }
}

/** May `actor` put a workflow into `workspaceId`? Needs editor or better there. */
export function canShareInto(actor: WorkflowActor, workspaceId: string): boolean {
  const m = actor.memberships.get(workspaceId)
  return !!m && m.role !== 'viewer' && memberCanUse(m.role, m.modules, 'workflows')
}

/** The caller as a workflow actor, or null when unauthenticated. */
export async function actorFromRequest(req: NextRequest): Promise<WorkflowActor | null> {
  let user
  try {
    user = getAuthUser(req)
  } catch {
    user = null
  }
  return user ? loadActor(user.user_id, user.account_type) : null
}
