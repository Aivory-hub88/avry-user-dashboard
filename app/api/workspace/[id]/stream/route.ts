/**
 * GET /api/workspace/[id]/stream — Discussion roots Space (Phase 1, read-only).
 *
 * Query: ?limit= (default 50, cap 200) ?before= (ISO, halaman lebih lama)
 * ?after= (ISO, pesan lebih baru). Roots newest-first + replyCount +
 * topic row + recentReplies (2 balasan terakhir per thread, ascending —
 * bahan chat inline) + truncated. Write/Data/Board tidak tersentuh.
 */
import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { getDocRole, canRead, checkAgentAccess } from "@/lib/workspaceAccess"
import { workspaceCredential, unauthorized, forbidden } from "@/lib/workspaceAuth"
import {
  clampLimit,
  spaceMessageFromRow,
  spaceTopicFromRow,
  replyCountOf,
} from "@/lib/spaceThreads"
import type { SpaceMessage } from "@/lib/spaceProtocol"

export const runtime = "nodejs"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const credential = workspaceCredential(req)
  if (!credential) return unauthorized()
  if (await checkAgentAccess(id, credential, req.headers.get("x-agent-type"), "read"))
    return forbidden()
  if (!canRead(await getDocRole(credential, id))) return forbidden()

  const sp = req.nextUrl.searchParams
  const limit = clampLimit(sp.get("limit"))
  const before = sp.get("before")?.slice(0, 64)
  const after = sp.get("after")?.slice(0, 64)

  const conds = ["m.space_id = $1", "m.thread_root IS NULL"]
  const values: unknown[] = [id]
  if (before) {
    conds.push(`m.created_at < $${values.length + 1}`)
    values.push(before)
  }
  if (after) {
    conds.push(`m.created_at > $${values.length + 1}`)
    values.push(after)
  }

  try {
    const result = await query(
      `SELECT m.*,
              (SELECT COUNT(*) FROM dashboard.workspace_messages r WHERE r.thread_root = m.id) AS reply_count,
              t.id AS topic_id, t.title AS topic_title, t.archived AS topic_archived,
              t.doc_id AS topic_doc, t.created_by AS topic_by, t.created_at AS topic_at
       FROM dashboard.workspace_messages m
       LEFT JOIN dashboard.workspace_topics t ON t.thread_root = m.id
       WHERE ${conds.join(" AND ")}
       ORDER BY m.created_at DESC
       LIMIT ${limit}`,
      values,
    )
    const roots = []
    const rootIds: string[] = []
    for (const row of result.rows as Record<string, unknown>[]) {
      const msg = spaceMessageFromRow(row, id)
      if (!msg) continue
      const topic =
        typeof row.topic_id === "string"
          ? spaceTopicFromRow({
              id: row.topic_id,
              thread_root: msg.id,
              title: row.topic_title,
              archived: row.topic_archived,
              doc_id: row.topic_doc,
              created_by: row.topic_by,
              created_at: row.topic_at,
            })
          : null
      rootIds.push(msg.id)
      roots.push({ ...msg, replyCount: replyCountOf(row), topic })
    }
    // Chat inline: 2 balasan terakhir per thread (ascending). Satu query
    // windowed — tanpa N+1, tanpa migrasi; field aditif (klien lama abaikan).
    const repliesByRoot = new Map<string, SpaceMessage[]>()
    if (rootIds.length > 0) {
      const placeholders = rootIds.map((_, i) => `$${i + 2}`).join(", ")
      const rep = await query(
        `SELECT * FROM (
           SELECT m.*, ROW_NUMBER() OVER (PARTITION BY m.thread_root ORDER BY m.created_at DESC) AS rn
           FROM dashboard.workspace_messages m
           WHERE m.space_id = $1 AND m.thread_root IN (${placeholders})
         ) s WHERE s.rn <= 2 ORDER BY s.thread_root, s.created_at ASC`,
        [id, ...rootIds],
      )
      for (const row of rep.rows as Record<string, unknown>[]) {
        const m = spaceMessageFromRow(row, id)
        if (!m || !m.threadRoot) continue
        const list = repliesByRoot.get(m.threadRoot) ?? []
        list.push(m)
        repliesByRoot.set(m.threadRoot, list)
      }
    }
    const withReplies = roots.map((r: { id: string }) => ({
      ...r,
      recentReplies: repliesByRoot.get(r.id) ?? [],
    }))
    return NextResponse.json({ roots: withReplies, truncated: result.rows.length === limit })
  } catch (error) {
    console.error("[workspace/stream GET]", error)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}
