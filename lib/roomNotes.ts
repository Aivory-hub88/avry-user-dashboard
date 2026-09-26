/**
 * Room notes (ADR-019 P5) — model + access, SERVER-ONLY for the gate.
 * Short shared notes in a room (the Notion-style pages are gone); plain
 * text with light markdown, readable by the room's agents.
 *
 * P6: a note can sit on a day (it shows on the timeline) and be meant for
 * one person or agent in the room. The addressee is checked against the
 * room's people and agents on every write.
 */
import { NextResponse, type NextRequest } from "next/server"
import { getDocRole, canRead, canWrite, checkAgentAccess } from "@/lib/workspaceAccess"
import { workspaceCredential, unauthorized, forbidden, type WorkspaceCredential } from "@/lib/workspaceAuth"
import { fileRoom } from "@/lib/workspaceFileRoom"
import { requesterFrom, requesterKey } from "@/lib/spaceWrite"
import { query } from "@/lib/db"
import { agentDisplayName } from "@/lib/spaceAgent"
import { isDay, toDay, type Day } from "@/lib/timeline"

export const NOTE_TITLE_MAX = 120
export const NOTE_BODY_MAX = 20_000
export const NOTES_PER_ROOM = 200

export interface RoomNote {
  id: string
  title: string
  body: string
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
  onDate: Day | null
  forKind: NoteForKind | null
  forId: string | null
  forName: string
}

export type NoteForKind = "member" | "agent"

/** pg returns DATE as a local-midnight Date; read it back without shifting. */
function dateOnly(d: Date): Day {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : typeof v === "string" ? v : "")

export function noteFromRow(r: Record<string, unknown>): RoomNote {
  return {
    id: String(r.id ?? ""),
    title: String(r.title ?? ""),
    body: String(r.body ?? ""),
    createdBy: String(r.created_by ?? ""),
    updatedBy: String(r.updated_by ?? ""),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    onDate: r.on_date instanceof Date ? dateOnly(r.on_date) : toDay(r.on_date),
    forKind: r.for_kind === "member" || r.for_kind === "agent" ? r.for_kind : null,
    forId: typeof r.for_id === "string" ? r.for_id : null,
    forName: String(r.for_name ?? ""),
  }
}

export interface NoteInput {
  title?: string
  body?: string
  /** null clears the date. */
  onDate?: Day | null
  /** null clears the addressee. */
  for?: { kind: NoteForKind; id: string } | null
}

/** Only the keys sent, trimmed to the limits. Bad dates/addressees are dropped. */
export function cleanNoteInput(input: unknown): NoteInput {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>
  const out: NoteInput = {}
  if (typeof o.title === "string") out.title = o.title.trim().slice(0, NOTE_TITLE_MAX)
  if (typeof o.body === "string") out.body = o.body.slice(0, NOTE_BODY_MAX)
  if (o.onDate === null || o.onDate === "") out.onDate = null
  else if (isDay(o.onDate)) out.onDate = o.onDate
  if (o.for === null) out.for = null
  else if (o.for && typeof o.for === "object") {
    const f = o.for as Record<string, unknown>
    if ((f.kind === "member" || f.kind === "agent") && typeof f.id === "string" && f.id.trim() && f.id.length <= 100)
      out.for = { kind: f.kind, id: f.id.trim() }
  }
  return out
}

/**
 * The addressee's display name when they belong to the room, else null.
 * Members: the owner, anyone granted the room, or its team. Agents: the
 * agents invited to the room.
 */
export async function addresseeName(roomId: string, kind: NoteForKind, id: string): Promise<string | null> {
  if (kind === "agent") {
    const r = await query(`SELECT 1 FROM dashboard.workspace_agent_acl WHERE doc_id = $1 AND agent_type = $2`, [roomId, id])
    return r.rows.length > 0 ? agentDisplayName(id) : null
  }
  const r = await query(
    `SELECT u.full_name, u.email FROM identity.users u
     WHERE u.id = $2 AND (
       EXISTS (SELECT 1 FROM dashboard.workspace_docs d WHERE d.id IN ($1, 'workspace:' || $1) AND d.owner = $2)
       OR EXISTS (SELECT 1 FROM dashboard.workspace_doc_acl a WHERE a.doc_id = $1 AND a.user_id = $2)
       OR EXISTS (
         SELECT 1 FROM dashboard.workspace_docs d JOIN dashboard.workspace_members m ON m.workspace_id = d.workspace_id
         WHERE d.id = $1 AND d.workspace_id <> 'default' AND m.user_id = $2))
     LIMIT 1`,
    [roomId, id],
  )
  const row = r.rows[0] as { full_name?: string | null; email?: string | null } | undefined
  if (!row) return null
  return (row.full_name || row.email || "Member").trim()
}

/** Room exists + caller's role; a Response to return on failure. */
export async function noteGate(
  req: NextRequest,
  id: string,
  need: "read" | "write",
): Promise<{ cred: WorkspaceCredential; who: string } | Response> {
  const cred = workspaceCredential(req)
  if (!cred) return unauthorized()
  if (await checkAgentAccess(id, cred, req.headers.get("x-agent-type"), need)) return forbidden()
  const role = await getDocRole(cred, id)
  if (need === "write" ? !canWrite(role) : !canRead(role)) return forbidden()
  if (!(await fileRoom(id))) return NextResponse.json({ error: "room not found" }, { status: 404 })
  return { cred, who: requesterKey(requesterFrom(req, cred)) }
}
