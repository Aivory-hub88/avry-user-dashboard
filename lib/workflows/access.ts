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
  /** The team's admins (workspace owner + owner-role members). */
  admins?: string[]
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
  // Shared into a team: access follows the member's team role.
  const m = spec.workspace_id ? actor.memberships.get(spec.workspace_id) : undefined
  const shared: WorkflowAccess =
    m && memberCanUse(m.role, m.modules, 'workflows')
      ? m.role === 'owner' ? 'owner' : m.role === 'editor' ? 'editor' : 'viewer'
      : null
  if (shared) return shared
  // Everything a team admin owns is readable by every member of that team.
  if (spec.owner) {
    for (const t of actor.memberships.values())
      if (t.admins?.includes(spec.owner) && memberCanUse(t.role, t.modules, 'workflows')) return 'viewer'
  }
  return null
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
      `WITH mine AS (
         SELECT w.id AS workspace_id, 'owner' AS role, NULL::text[] AS modules
           FROM dashboard.workspaces w WHERE w.owner = $1 AND w.id <> $2
         UNION ALL
         SELECT m.workspace_id, m.role, m.modules
           FROM dashboard.workspace_members m WHERE m.user_id = $1 AND m.workspace_id <> $2
       )
       SELECT mine.workspace_id, mine.role, mine.modules,
              ARRAY(SELECT w.owner FROM dashboard.workspaces w WHERE w.id = mine.workspace_id
                    UNION SELECT m.user_id FROM dashboard.workspace_members m
                           WHERE m.workspace_id = mine.workspace_id AND m.role = 'owner') AS admins
         FROM mine`,
      [userId, LEGACY_WORKSPACE],
    )
    for (const row of r.rows) {
      const id = String(row.workspace_id)
      // owner wins over a duplicate member row
      if (!memberships.has(id) || row.role === 'owner')
        memberships.set(id, {
          role: String(row.role),
          modules: (row.modules as string[] | null) ?? null,
          admins: ((row.admins as string[] | null) ?? []).map(String),
        })
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

export interface WorkflowCreator {
  id: string
  name: string | null
  email: string | null
  /** The caller created it. */
  me: boolean
}

/** Response-only fields; never persisted (routes strip them from writes). */
export type WorkflowView = AivoryWorkflowSpec & { created_by: WorkflowCreator | null; access: WorkflowAccess }

/** Attach who created each workflow and what the caller may do with it. */
export async function describeForActor(specs: AivoryWorkflowSpec[], actor: WorkflowActor): Promise<WorkflowView[]> {
  const ids = Array.from(new Set(specs.map((s) => s.owner).filter((x): x is string => !!x)))
  const people = new Map<string, { name: string | null; email: string | null }>()
  if (ids.length > 0) {
    try {
      const r = await query(`SELECT id, full_name, email FROM identity.users WHERE id = ANY($1::text[])`, [ids])
      for (const row of r.rows) people.set(String(row.id), { name: (row.full_name as string | null) ?? null, email: (row.email as string | null) ?? null })
    } catch (e) {
      console.error('[workflows/access] creators', e)
    }
  }
  return specs.map((s) => ({
    ...s,
    created_by: s.owner
      ? { id: s.owner, name: people.get(s.owner)?.name ?? null, email: people.get(s.owner)?.email ?? null, me: s.owner === actor.userId }
      : null,
    access: resolveWorkflowAccess(s, actor),
  }))
}
