/**
 * Team workspaces — SERVER-ONLY (ADR-019 P1).
 *
 * A team is a row in dashboard.workspaces other than 'default'. Its creator
 * is the owner (the "admin" who approves project requests); members come
 * from dashboard.workspace_members. Because getDocRolesBatch already maps a
 * doc's workspace_id through workspace_members, team members get access to
 * the team's rooms without per-doc ACL.
 *
 * 'default' is the legacy shared workspace every existing doc lives in.
 * Nobody may join it through these helpers — membership there would grant
 * editor on every user's pages.
 */
import { query } from "@/lib/db"
import type { WorkspaceCredential } from "@/lib/workspaceAuth"

export type TeamRole = "owner" | "editor" | "viewer"

export const LEGACY_WORKSPACE = "default"
export const MAX_OWNED_TEAMS = 10

export interface Team {
  id: string
  name: string
  role: TeamRole
  owner: string
}

export function isPlatformAdmin(cred: WorkspaceCredential): boolean {
  return cred.kind === "service" || cred.user.account_type === "admin" || cred.user.account_type === "superadmin"
}

/** The caller's role in a team; platform admins act as owner. null = not in it. */
export async function teamRole(cred: WorkspaceCredential, workspaceId: string): Promise<TeamRole | null> {
  if (workspaceId === LEGACY_WORKSPACE) return isPlatformAdmin(cred) ? "owner" : null
  const ws = await query(`SELECT owner FROM dashboard.workspaces WHERE id = $1`, [workspaceId])
  if (ws.rows.length === 0) return null
  if (isPlatformAdmin(cred)) return "owner"
  if (cred.kind !== "user") return null
  const userId = cred.user.user_id
  if (ws.rows[0].owner === userId) return "owner"
  const m = await query(
    `SELECT role FROM dashboard.workspace_members WHERE workspace_id = $1 AND user_id = $2`,
    [workspaceId, userId],
  )
  const role = m.rows[0]?.role
  return role === "owner" || role === "editor" || role === "viewer" ? role : null
}

export async function myTeams(userId: string): Promise<Team[]> {
  const r = await query(
    `SELECT w.id, w.name, w.owner,
            CASE WHEN w.owner = $1 THEN 'owner' ELSE m.role END AS role
     FROM dashboard.workspaces w
     LEFT JOIN dashboard.workspace_members m ON m.workspace_id = w.id AND m.user_id = $1
     WHERE w.id <> $2 AND (w.owner = $1 OR m.user_id IS NOT NULL)
     ORDER BY w.created_at`,
    [userId, LEGACY_WORKSPACE],
  )
  return r.rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    owner: String(row.owner),
    role: row.role as TeamRole,
  }))
}

/** Team owners (for inbox fan-out and "who approves" copy). */
export async function teamOwnerIds(workspaceId: string): Promise<string[]> {
  const r = await query(
    `SELECT owner AS user_id FROM dashboard.workspaces WHERE id = $1
     UNION SELECT user_id FROM dashboard.workspace_members WHERE workspace_id = $1 AND role = 'owner'`,
    [workspaceId],
  )
  return r.rows.map((row) => String(row.user_id))
}

export function cleanTeamName(v: unknown): string | null {
  const name = typeof v === "string" ? v.trim().replace(/\s+/g, " ") : ""
  return name.length >= 2 && name.length <= 80 ? name : null
}
