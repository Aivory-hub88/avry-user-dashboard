/**
 * /api/workspace/[id]/notes — a room's shared notes (ADR-019 P5).
 * GET → newest first. POST { title?, body?, onDate?, for? } → new note (write role).
 */
import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { newId } from "@/lib/spaceWrite"
import { addresseeName, cleanNoteInput, noteFromRow, noteGate, NOTES_PER_ROOM } from "@/lib/roomNotes"

export const runtime = "nodejs"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const g = await noteGate(req, id, "read")
  if (g instanceof Response) return g
  try {
    const r = await query(
      `SELECT * FROM dashboard.room_notes WHERE room_id = $1 AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT ${NOTES_PER_ROOM}`,
      [id],
    )
    return NextResponse.json({ notes: r.rows.map((row) => noteFromRow(row as Record<string, unknown>)) })
  } catch (e) {
    console.error("[notes GET]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const g = await noteGate(req, id, "write")
  if (g instanceof Response) return g
  const v = cleanNoteInput(await req.json().catch(() => ({})))
  const forName = v.for ? await addresseeName(id, v.for.kind, v.for.id).catch(() => null) : ""
  if (forName === null) return NextResponse.json({ error: "that person or agent isn't in this room" }, { status: 400 })
  try {
    const count = await query(`SELECT count(*)::int AS n FROM dashboard.room_notes WHERE room_id = $1 AND deleted_at IS NULL`, [id])
    if (Number(count.rows[0]?.n ?? 0) >= NOTES_PER_ROOM)
      return NextResponse.json({ error: `a room can hold ${NOTES_PER_ROOM} notes` }, { status: 409 })
    const r = await query(
      `INSERT INTO dashboard.room_notes (id, room_id, title, body, created_by, updated_by, on_date, for_kind, for_id, for_name)
       VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8, $9) RETURNING *`,
      [newId(), id, v.title ?? "", v.body ?? "", g.who, v.onDate ?? null, v.for?.kind ?? null, v.for?.id ?? null, forName],
    )
    return NextResponse.json({ note: noteFromRow(r.rows[0] as Record<string, unknown>) }, { status: 201 })
  } catch (e) {
    console.error("[notes POST]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}
