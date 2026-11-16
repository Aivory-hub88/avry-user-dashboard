import { NextResponse } from "next/server"
import { query } from "@/lib/db"
import type { WorkspaceCredential } from "@/lib/workspaceAuth"
import { personKey, type FieldPeopleAdded, type PersonRef } from "@/lib/workspaceDbModel"

/** Who may be named on a task of a room: its members (users) and invited agents. */
export type RoomRoster = { userIds: ReadonlySet<string>; agentTypes: ReadonlySet<string> }

/**
 * Same people the Members rail lists (GET /api/workspace/[id]/members): the
 * doc owner, per-doc ACL grants, the team's workspace members (not for the
 * shared 'default' workspace) and agents invited through workspace_agent_acl.
 */
export async function loadRoomRoster(docId: string): Promise<RoomRoster> {
  const doc = await query(
    `SELECT owner, workspace_id FROM dashboard.workspace_docs WHERE id = $1 OR id = $2 ORDER BY (id = $1) DESC LIMIT 1`,
    [`workspace:${docId}`, docId],
  )
  const row = (doc.rows[0] ?? {}) as Record<string, unknown>
  const userIds = new Set<string>()
  if (typeof row.owner === "string" && row.owner) userIds.add(row.owner)
  const grants = await query(`SELECT user_id FROM dashboard.workspace_doc_acl WHERE doc_id = $1`, [docId])
  for (const g of grants.rows as Record<string, unknown>[]) userIds.add(String(g.user_id))
  const workspaceId = typeof row.workspace_id === "string" && row.workspace_id ? row.workspace_id : "default"
  if (workspaceId !== "default") {
    const team = await query(`SELECT user_id FROM dashboard.workspace_members WHERE workspace_id = $1`, [workspaceId])
    for (const m of team.rows as Record<string, unknown>[]) userIds.add(String(m.user_id))
  }
  const agents = await query(`SELECT agent_type FROM dashboard.workspace_agent_acl WHERE doc_id = $1`, [docId])
  return { userIds, agentTypes: new Set((agents.rows as Record<string, unknown>[]).map((a) => String(a.agent_type))) }
}

/** Refs that are neither a room member nor an invited agent (pure). */
export function refsOutsideRoster(refs: readonly PersonRef[], roster: RoomRoster, selfUserId?: string | null): PersonRef[] {
  const seen = new Set<string>()
  const out: PersonRef[] = []
  for (const p of refs) {
    const key = personKey(p)
    if (seen.has(key)) continue
    seen.add(key)
    const ok = p.kind === "agent" ? roster.agentTypes.has(p.type) : roster.userIds.has(p.id) || p.id === selfUserId
    if (!ok) out.push(p)
  }
  return out
}

/** The acting user's own id (a caller with write access may always name themselves). */
export function callerUserId(cred: WorkspaceCredential): string | null {
  return cred.kind === "user" ? cred.user.user_id : null
}

/**
 * First ref in `added` the room does not know, or null. Callers pass ONLY the
 * refs a write newly adds (never what a row already holds), so legacy rows
 * with people who have since left are never blocked on unrelated writes.
 * The roster is loaded lazily: no added refs, no queries.
 */
export async function unknownRoomPerson(docId: string, added: readonly PersonRef[], cred: WorkspaceCredential): Promise<PersonRef | null> {
  if (added.length === 0) return null
  const roster = await loadRoomRoster(docId)
  return refsOutsideRoster(added, roster, callerUserId(cred))[0] ?? null
}

/**
 * 400 for a person outside the room, shaped like the other body errors:
 * `invalid assignees` / `invalid owner` / `invalid cells` (+ `field`), reason
 * `not_member`, `person` = the ref key (`user:<id>` / `agent:<type>`).
 */
export function notMemberResponse(
  stranger: PersonRef,
  where: { assignees: readonly PersonRef[]; owner?: PersonRef | null; fieldPeople: readonly FieldPeopleAdded[] },
): NextResponse {
  const key = personKey(stranger)
  if (where.assignees.some((p) => personKey(p) === key)) return NextResponse.json({ error: "invalid assignees", reason: "not_member", person: key }, { status: 400 })
  const inField = where.fieldPeople.find((f) => f.added.some((p) => personKey(p) === key))
  if (!inField && where.owner && personKey(where.owner) === key) return NextResponse.json({ error: "invalid owner", reason: "not_member", person: key }, { status: 400 })
  return NextResponse.json({ error: "invalid cells", field: inField?.fieldId, reason: "not_member", person: key }, { status: 400 })
}
