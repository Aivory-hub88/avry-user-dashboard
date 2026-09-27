/**
 * /api/workspace/[id]/notes/[noteId] (ADR-019 P5).
 * PATCH { title?, body?, onDate?, for? } (write role). for = { kind, id } | null. DELETE → soft delete (write role).
 */
import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { addresseeName, cleanNoteInput, noteFromRow, noteGate } from "@/lib/roomNotes"

export const runtime = "nodejs"

type Ctx = { params: Promise<{ id: string; noteId: string }> }

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id, noteId } = await params
  const g = await noteGate(req, id, "write")
  if (g instanceof Response) return g
  const v = cleanNoteInput(await req.json().catch(() => ({})))
  const sets: string[] = []
  const values: unknown[] = [noteId, id, g.who]
  if (v.title !== undefined) {
    values.push(v.title)
    sets.push(`title = $${values.length}`)
  }
  if (v.body !== undefined) {
    values.push(v.body)
    sets.push(`body = $${values.length}`)
  }
  if (v.onDate !== undefined) {
    values.push(v.onDate)
    sets.push(`on_date = $${values.length}`)
  }
  if (v.for !== undefined) {
    const name = v.for ? await addresseeName(id, v.for.kind, v.for.id) : ""
    if (name === null) return NextResponse.json({ error: "that person or agent isn't in this room" }, { status: 400 })
    values.push(v.for?.kind ?? null, v.for?.id ?? null, name)
    sets.push(`for_kind = $${values.length - 2}`, `for_id = $${values.length - 1}`, `for_name = $${values.length}`)
  }
  if (sets.length === 0) return NextResponse.json({ error: "nothing to change" }, { status: 400 })
  try {
    const r = await query(
      `UPDATE dashboard.room_notes SET ${sets.join(", ")}, updated_by = $3, updated_at = now()
       WHERE id = $1 AND room_id = $2 AND deleted_at IS NULL RETURNING *`,
      values,
    )
    if (!r.rows[0]) return NextResponse.json({ error: "note not found" }, { status: 404 })
    return NextResponse.json({ note: noteFromRow(r.rows[0] as Record<string, unknown>) })
  } catch (e) {
    console.error("[notes PATCH]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { id, noteId } = await params
  const g = await noteGate(req, id, "write")
  if (g instanceof Response) return g
  try {
    const r = await query(
      `UPDATE dashboard.room_notes SET deleted_at = now(), updated_by = $3 WHERE id = $1 AND room_id = $2 AND deleted_at IS NULL RETURNING id`,
      [noteId, id, g.who],
    )
    if (!r.rows[0]) return NextResponse.json({ error: "note not found" }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[notes DELETE]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}
