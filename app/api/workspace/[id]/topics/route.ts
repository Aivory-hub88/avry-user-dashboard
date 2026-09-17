/**
 * POST /api/workspace/[id]/topics — beri judul goal ke thread (Phase 2).
 *
 * Body: { rootMessageId?, title, body?, docId? }.
 * Tanpa rootMessageId: thread + root message baru dibuat (body ?? title).
 * Max 1 topic per thread (409 bila sudah ada).
 */
import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { getDocRole, canWrite, checkAgentAccess } from "@/lib/workspaceAccess"
import { workspaceCredential, unauthorized, forbidden } from "@/lib/workspaceAuth"
import { parseSpaceMentions } from "@/lib/spaceProtocol"
import { spaceMessageFromRow, spaceTopicFromRow } from "@/lib/spaceThreads"
import { requesterFrom, newId, cleanBody } from "@/lib/spaceWrite"

export const runtime = "nodejs"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const credential = workspaceCredential(req)
  if (!credential) return unauthorized()
  if (await checkAgentAccess(id, credential, req.headers.get("x-agent-type"), "write"))
    return forbidden()
  if (!canWrite(await getDocRole(credential, id))) return forbidden()

  const payload = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const title = typeof payload.title === "string" ? payload.title.trim().slice(0, 200) : ""
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 })
  const rootMessageId =
    typeof payload.rootMessageId === "string" ? payload.rootMessageId.slice(0, 128) : null
  const docId = typeof payload.docId === "string" && payload.docId.trim() ? payload.docId.slice(0, 128) : null

  try {
    const me = requesterFrom(req, credential)
    let rootId = rootMessageId
    let rootMsg = null

    if (rootId) {
      const parent = await query(
        `SELECT * FROM dashboard.workspace_messages
         WHERE id = $1 AND space_id = $2 AND thread_root IS NULL`,
        [rootId, id],
      )
      if (parent.rows.length === 0)
        return NextResponse.json({ error: "thread not found" }, { status: 404 })
      rootMsg = spaceMessageFromRow(parent.rows[0] as Record<string, unknown>, id)
      const existing = await query(
        `SELECT id FROM dashboard.workspace_topics WHERE thread_root = $1`,
        [rootId],
      )
      if (existing.rows.length > 0)
        return NextResponse.json({ error: "thread already has a topic" }, { status: 409 })
    } else {
      const bodyText = cleanBody(payload.body) ?? title
      const msgId = newId()
      const stamps = parseSpaceMentions(bodyText)
      await query(
        `INSERT INTO dashboard.workspace_threads (id, space_id, created_by)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [msgId, id, `${me.kind}:${me.id}`],
      )
      const inserted = await query(
        `INSERT INTO dashboard.workspace_messages
           (id, space_id, thread_root, author_kind, author_id, author_name, agent_type,
            body, mentions, member_ids, here, has_agent, doc_refs)
         VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [
          msgId, id, me.kind, me.id, me.name, me.agentType ?? null, bodyText,
          stamps.agentTypes, stamps.memberIds, stamps.here, stamps.hasAgent, stamps.docRefs,
        ],
      )
      rootId = msgId
      rootMsg = spaceMessageFromRow(inserted.rows[0] as Record<string, unknown>, id)
    }

    const topicId = newId()
    const created = await query(
      `INSERT INTO dashboard.workspace_topics
         (id, thread_root, title, archived, doc_id, created_by)
       VALUES ($1, $2, $3, false, $4, $5) RETURNING *`,
      [topicId, rootId, title, docId, `${me.kind}:${me.id}`],
    )
    const topic = spaceTopicFromRow(created.rows[0] as Record<string, unknown>)
    if (!topic) return NextResponse.json({ error: "db" }, { status: 500 })
    return NextResponse.json({ topic, root: rootMsg }, { status: 201 })
  } catch (error) {
    console.error("[workspace/topics POST]", error)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}
