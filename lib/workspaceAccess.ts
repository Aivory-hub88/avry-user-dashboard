import { query } from '@/lib/db'
import type { WorkspaceCredential } from '@/lib/workspaceAuth'

export type DocRole = 'owner' | 'editor' | 'viewer' | null

export async function getDocRole(
  cred: WorkspaceCredential,
  docId: string,
): Promise<DocRole> {
  if (cred.kind === 'service') return 'owner'
  const userId = cred.user.user_id
  if (cred.user.account_type === 'admin' || cred.user.account_type === 'superadmin') return 'owner'
  const roomKey = `workspace:${docId}`
  const rows = await query(
    'SELECT id, owner, workspace_id FROM dashboard.workspace_docs WHERE id = $1 OR id = $2',
    [roomKey, docId],
  )
  const row = rows.rows.find((r: any) => r.id === roomKey) ?? rows.rows[0]
  if (!row) return 'editor' // new doc claimable
  if (row.owner === userId) return 'owner'
  if (!row.owner) return 'editor' // ownerless claimable
  const workspaceId: string = row.workspace_id || 'default'
  // doc ACL wins
  const acl = await query(
    'SELECT role FROM dashboard.workspace_doc_acl WHERE doc_id = $1 AND user_id = $2',
    [docId, userId],
  )
  if (acl.rows.length > 0) {
    const r = acl.rows[0].role as string
    if (r === 'editor' || r === 'viewer' || r === 'owner') return r as DocRole
  }
  const mem = await query(
    'SELECT role FROM dashboard.workspace_members WHERE workspace_id = $1 AND user_id = $2',
    [workspaceId, userId],
  )
  if (mem.rows.length > 0) {
    const r = mem.rows[0].role as string
    if (r === 'owner' || r === 'editor') return 'editor'
    if (r === 'viewer') return 'viewer'
  }
  return null
}

export function canRead(role: DocRole): boolean {
  return role !== null
}
export function canWrite(role: DocRole): boolean {
  return role === 'owner' || role === 'editor'
}
