/**
 * PATCH /api/workspace/[id]/topics/[t] — kelola topic (Phase 2).
 *
 * Body: { op: retitle|archive|unarchive|remove|attach|detach, title?, docId? }.
 * remove = hapus topic saja, pesan TIDAK ikut terhapus (convert back to thread).
 * Topic harus milik Space ini (join threads), kalau tidak 404.
 */
import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { getDocRole, canWrite, checkAgentAccess } from "@/lib/workspaceAccess"
import { workspaceCredential, unauthorized, forbidden } from "@/lib/workspaceAuth"
import { spaceTopicFromRow } from "@/lib/spaceThreads"

export const runtime = "nodejs"

const OPS = new Set(["retitle", "archive", "unarchive", "remove", "attach", "detach"])

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; t: string }> },
) {
  const { id, t } = await params
  const credential = workspaceCredential(req)
  if (!credential) return unauthorized()
  if (await checkAgentAccess(id, credential, req.headers.get("x-agent-type"), "write"))
    return forbidden()
  if (!canWrite(await getDocRole(credential, id))) return forbidden()

  const payload = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const op = typeof payload.op === "string" ? payload.op : ""
  if (!OPS.has(op)) return NextResponse.json({ error: "invalid op" }, { status: 400 })

  try {
    const found = await query(
      `SELECT tp.* FROM dashboard.workspace_topics tp
       JOIN dashboard.workspace_threads th ON th.id = tp.thread_root
       WHERE tp.id = $1 AND th.space_id = $2`,
      [t, id],
    )
    if (found.rows.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 })

    if (op === "remove") {
      await query(`DELETE FROM dashboard.workspace_topics WHERE id = $1`, [t])
      return NextResponse.json({ ok: true })
    }

    if (op === "retitle") {
      const title = typeof payload.title === "string" ? payload.title.trim().slice(0, 200) : ""
      if (!title) return NextResponse.json({ error: "title required" }, { status: 400 })
      const updated = await query(
        `UPDATE dashboard.workspace_topics SET title = $1 WHERE id = $2 RETURNING *`,
        [title, t],
      )
      return NextResponse.json({
        topic: spaceTopicFromRow(updated.rows[0] as Record<string, unknown>),
      })
    }

    if (op === "attach") {
      const docId = typeof payload.docId === "string" && payload.docId.trim() ? payload.docId.slice(0, 128) : ""
      if (!docId) return NextResponse.json({ error: "docId required" }, { status: 400 })
      const updated = await query(
        `UPDATE dashboard.workspace_topics SET doc_id = $1 WHERE id = $2 RETURNING *`,
        [docId, t],
      )
      return NextResponse.json({
        topic: spaceTopicFromRow(updated.rows[0] as Record<string, unknown>),
      })
    }

    if (op === "detach") {
      const updated = await query(
        `UPDATE dashboard.workspace_topics SET doc_id = NULL WHERE id = $1 RETURNING *`,
        [t],
      )
      return NextResponse.json({
        topic: spaceTopicFromRow(updated.rows[0] as Record<string, unknown>),
      })
    }

    const updated = await query(
      `UPDATE dashboard.workspace_topics SET archived = $1 WHERE id = $2 RETURNING *`,
      [op === "archive", t],
    )
    return NextResponse.json({
      topic: spaceTopicFromRow(updated.rows[0] as Record<string, unknown>),
    })
  } catch (error) {
    console.error("[workspace/topics PATCH]", error)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}
