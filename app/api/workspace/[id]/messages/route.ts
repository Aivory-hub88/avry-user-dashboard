/**
 * POST /api/workspace/[id]/messages — tulis root/reply (Phase 2).
 *
 * Body: { threadRoot?, body }. Stamp mention server-side (lib/spaceProtocol:
 * token link saja, code block = kutipan, bare @word = prose).
 * Reply ke thread yang archived → un-archive otomatis + flag di response.
 * Gate: tulis (owner/editor; agent butuh grant write via checkAgentAccess).
 */
import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { getDocRole, canWrite, checkAgentAccess } from "@/lib/workspaceAccess"
import { workspaceCredential, unauthorized, forbidden } from "@/lib/workspaceAuth"
import { recordWorkspaceActivity } from "@/lib/workspaceActivity"
import { parseSpaceMentions } from "@/lib/spaceProtocol"
import { spaceMessageFromRow } from "@/lib/spaceThreads"
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
  const threadRoot = typeof payload.threadRoot === "string" ? payload.threadRoot.slice(0, 128) : null
  const body = cleanBody(payload.body)
  if (!body) return NextResponse.json({ error: "body required (1..8000 chars)" }, { status: 400 })

  const me = requesterFrom(req, credential)
  const stamps = parseSpaceMentions(body)
  const msgId = newId()

  try {
    let rootId = msgId
    let unarchived = false
    if (threadRoot) {
      const parent = await query(
        `SELECT id FROM dashboard.workspace_messages
         WHERE id = $1 AND space_id = $2 AND thread_root IS NULL`,
        [threadRoot, id],
      )
      if (parent.rows.length === 0)
        return NextResponse.json({ error: "thread not found" }, { status: 404 })
      rootId = threadRoot
      const revived = await query(
        `UPDATE dashboard.workspace_topics SET archived = false
         WHERE thread_root = $1 AND archived = true RETURNING id`,
        [threadRoot],
      )
      if ((revived.rowCount ?? 0) > 0) {
        unarchived = true
        await recordWorkspaceActivity({
          docId: id,
          credential,
          agentType: me.agentType ?? "user",
          action: "thread.unarchived",
          summary: `${me.name} replied — discussion re-opened`,
        }).catch(() => {})
      }
    } else {
      await query(
        `INSERT INTO dashboard.workspace_threads (id, space_id, created_by)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [msgId, id, `${me.kind}:${me.id}`],
      )
    }

    const inserted = await query(
      `INSERT INTO dashboard.workspace_messages
         (id, space_id, thread_root, author_kind, author_id, author_name, agent_type,
          body, mentions, member_ids, here, has_agent, doc_refs)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        msgId,
        id,
        threadRoot,
        me.kind,
        me.id,
        me.name,
        me.agentType ?? null,
        body,
        stamps.agentTypes,
        stamps.memberIds,
        stamps.here,
        stamps.hasAgent,
        stamps.docRefs,
      ],
    )
    const message = spaceMessageFromRow(inserted.rows[0] as Record<string, unknown>, id)
    if (!message) return NextResponse.json({ error: "db" }, { status: 500 })
    return NextResponse.json({ message, threadRoot: rootId, unarchived }, { status: 201 })
  } catch (error) {
    console.error("[workspace/messages POST]", error)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}
