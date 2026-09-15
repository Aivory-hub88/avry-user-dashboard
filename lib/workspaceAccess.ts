import { query } from '@/lib/db'
import type { WorkspaceCredential } from '@/lib/workspaceAuth'
import { AGENT_TYPE_IDS, AGENT_NAMES, isAgentType, type AgentType } from '@/lib/agentRoster'

export type DocRole = 'owner' | 'editor' | 'viewer' | null

/** Cerveau agent types that can be invited to a doc (Fase 1 Opsi C). */
export const KNOWN_AGENT_TYPES = AGENT_TYPE_IDS

export type KnownAgentType = AgentType

export const AGENT_DISPLAY_NAMES: Record<string, string> = AGENT_NAMES

export const isKnownAgentType = isAgentType

/** Role granted to an agent on a doc, or null when not invited / revoked. */
export async function getAgentDocRole(docId: string, agentType: string): Promise<DocRole> {
  if (!isKnownAgentType(agentType)) return null
  try {
    const r = await query(
      'SELECT role FROM dashboard.workspace_agent_acl WHERE doc_id = $1 AND agent_type = $2',
      [docId, agentType],
    )
    const role = r.rows[0]?.role as string | undefined
    if (role === 'editor' || role === 'viewer') return role
    return null
  } catch {
    return null
  }
}

/**
 * Owner-or-admin gate shared by the acl + agents management routes.
 * Mirrors the closed-by-default model: service creds and admins bypass,
 * otherwise only the doc owner may manage grants.
 */
export async function canManageDoc(docId: string, accountType?: string, userId?: string): Promise<boolean> {
  if (accountType === 'admin' || accountType === 'superadmin') return true
  if (!userId) return false
  try {
    const r = await query(
      `SELECT 1 FROM dashboard.workspace_docs WHERE (id = $1 OR id = $2) AND owner = $3`,
      [`workspace:${docId}`, docId, userId],
    )
    return (r.rowCount ?? 0) > 0
  } catch {
    return false
  }
}

export async function getDocRole(
  cred: WorkspaceCredential,
  docId: string,
): Promise<DocRole> {
  const batch = await getDocRolesBatch(cred, [docId])
  return batch.get(docId) ?? null
}

/**
 * Batched role resolution — replaces N×getDocRole sequential calls in
 * GET /api/workspace (was up to 3 queries per doc → 300 queries for 100 docs).
 * Now exactly 3 queries total regardless of doc count:
 *   1. all doc rows (bare + room-keyed), 2. all ACL rows, 3. workspace members.
 * Precedence per doc mirrors getDocRole: owner → doc ACL → workspace member.
 */
export async function getDocRolesBatch(
  cred: WorkspaceCredential,
  docIds: string[],
): Promise<Map<string, DocRole>> {
  const out = new Map<string, DocRole>()
  if (docIds.length === 0) return out
  if (cred.kind === 'service') {
    for (const id of docIds) out.set(id, 'owner')
    return out
  }
  const userId = cred.user.user_id
  if (cred.user.account_type === 'admin' || cred.user.account_type === 'superadmin') {
    for (const id of docIds) out.set(id, 'owner')
    return out
  }
  const uniq = Array.from(new Set(docIds))
  const keys: string[] = []
  for (const id of uniq) keys.push(id, `workspace:${id}`)
  try {
    const docs = await query(
      `SELECT id, owner, workspace_id FROM dashboard.workspace_docs WHERE id = ANY($1)`,
      [keys],
    )
    const byBare = new Map<string, { owner: string | null; workspace_id: string }>()
    for (const r of docs.rows as any[]) {
      const bare = String(r.id).replace(/^workspace:/, '').replace(/^db:/, '')
      if (String(r.id).startsWith('workspace:')) {
        byBare.set(bare, { owner: r.owner ?? null, workspace_id: r.workspace_id || 'default' })
      } else if (!byBare.has(bare)) {
        byBare.set(bare, { owner: r.owner ?? null, workspace_id: r.workspace_id || 'default' })
      }
    }
    const needAcl: string[] = []
    const needMemWs = new Set<string>()
    for (const id of uniq) {
      const row = byBare.get(id)
      if (!row) continue // new/claimable doc — resolved below, no query needed
      if (row.owner === userId) { out.set(id, 'owner'); continue }
      if (!row.owner) continue // ownerless claimable — resolved below
      needAcl.push(id)
      needMemWs.add(row.workspace_id || 'default')
    }
    const aclByDoc = new Map<string, string>()
    if (needAcl.length > 0) {
      const acl = await query(
        `SELECT doc_id, role FROM dashboard.workspace_doc_acl WHERE doc_id = ANY($1) AND user_id = $2`,
        [needAcl, userId],
      )
      for (const r of acl.rows as any[]) aclByDoc.set(String(r.doc_id), String(r.role))
    }
    const memByWs = new Map<string, string>()
    if (needMemWs.size > 0) {
      const wsList = Array.from(needMemWs)
      const mem = await query(
        `SELECT workspace_id, role FROM dashboard.workspace_members WHERE workspace_id = ANY($1) AND user_id = $2`,
        [wsList, userId],
      )
      for (const r of mem.rows as any[]) memByWs.set(String(r.workspace_id), String(r.role))
    }
    for (const id of uniq) {
      if (out.has(id)) continue
      const row = byBare.get(id)
      if (!row) { out.set(id, 'editor'); continue } // new doc claimable
      if (!row.owner) { out.set(id, 'editor'); continue } // ownerless claimable
      const aclRole = aclByDoc.get(id)
      if (aclRole === 'editor' || aclRole === 'viewer' || aclRole === 'owner') {
        out.set(id, aclRole as DocRole); continue
      }
      const memRole = memByWs.get(row.workspace_id || 'default')
      if (memRole === 'owner' || memRole === 'editor') { out.set(id, 'editor'); continue }
      if (memRole === 'viewer') { out.set(id, 'viewer'); continue }
      // null = no access → omitted (caller filters)
    }
  } catch {
    // on DB error return whatever resolved — caller treats empty as no access
  }
  return out
}

export function canRead(role: DocRole): boolean {
  return role !== null
}
export function canWrite(role: DocRole): boolean {
  return role === 'owner' || role === 'editor'
}

/**
 * Read gate for an arbitrary doc (used by rollups + board aggregates that
 * fan out beyond the request's own doc). Service callers without an asserted
 * agent keep legacy full access; asserted known agents are scoped to their
 * grant on THAT doc; users go through the normal role resolution.
 */
export async function canReadDocId(
  cred: WorkspaceCredential,
  docId: string,
  agentType?: string | null,
): Promise<boolean> {
  if (cred.kind === 'service') {
    if (!isKnownAgentType(agentType)) return true
    return canRead(await getAgentDocRole(docId, agentType))
  }
  return canRead(await getDocRole(cred, docId))
}

/**
 * Agent gate for service-credential calls (Cerveau → dashboard → collab).
 * Client-asserted agent types are only meaningful with a service credential;
 * user credentials and unasserted service calls keep legacy behavior (null =
 * allowed, enforcement happens in getDocRole / collab as before).
 * Returns 'forbidden' when an invited-and-checked agent lacks the access.
 */
export async function checkAgentAccess(
  docId: string,
  cred: WorkspaceCredential,
  agentType: string | null | undefined,
  need: 'read' | 'write',
): Promise<null | 'forbidden'> {
  if (cred.kind !== 'service' || !isKnownAgentType(agentType)) return null
  const role = await getAgentDocRole(docId, agentType)
  if (need === 'write' ? !canWrite(role) : !canRead(role)) return 'forbidden'
  return null
}
