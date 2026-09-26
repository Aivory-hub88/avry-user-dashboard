/**
 * Room notes (ADR-019 P5) — model + access, SERVER-ONLY for the gate.
 * Short shared notes in a room (the Notion-style pages are gone); plain
 * text with light markdown, readable by the room's agents.
 */
import { NextResponse, type NextRequest } from "next/server"
import { getDocRole, canRead, canWrite, checkAgentAccess } from "@/lib/workspaceAccess"
import { workspaceCredential, unauthorized, forbidden, type WorkspaceCredential } from "@/lib/workspaceAuth"
import { fileRoom } from "@/lib/workspaceFileRoom"
import { requesterFrom, requesterKey } from "@/lib/spaceWrite"

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
  }
}

/** Only the keys sent, trimmed to the limits. */
export function cleanNoteInput(input: unknown): { title?: string; body?: string } {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>
  const out: { title?: string; body?: string } = {}
  if (typeof o.title === "string") out.title = o.title.trim().slice(0, NOTE_TITLE_MAX)
  if (typeof o.body === "string") out.body = o.body.slice(0, NOTE_BODY_MAX)
  return out
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
