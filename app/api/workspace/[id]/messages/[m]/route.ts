/**
 * PATCH / DELETE /api/workspace/[id]/messages/[m] — edit/hapus author-only.
 *
 * PATCH { body }: edit in-place + edited_at. DELETE: tombstone (body → '',
 * deleted_at) — pesan tidak pernah hilang fisik, topic/listener tetap utuh.
 */
import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { getDocRole, canRead, checkAgentAccess } from "@/lib/workspaceAccess"
import { workspaceCredential, unauthorized, forbidden } from "@/lib/workspaceAuth"
import { parseSpaceMentions } from "@/lib/spaceProtocol"
import { spaceMessageFromRow } from "@/lib/spaceThreads"
import { requesterFrom, requesterKey, authorKeyOf, cleanBody } from "@/lib/spaceWrite"

export const runtime = "nodejs"

async function ownMessage(spaceId: string, msgId: string, key: string) {
  const found = await query(
    `SELECT * FROM dashboard.workspace_messages WHERE id = $1 AND space_id = $2`,
    [msgId, spaceId],
  )
  if (found.rows.length === 0) return { status: 404 as const }
  const row = found.rows[0] as Record<string, unknown>
  if (row.deleted_at) return { status: 410 as const }
  if (authorKeyOf(row) !== key) return { status: 403 as const }
  return { row }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; m: string }> },
) {
  const { id, m } = await params
  const credential = workspaceCredential(req)
  if (!credential) return unauthorized()
  if (await checkAgentAccess(id, credential, req.headers.get("x-agent-type"), "write"))
    return forbidden()
  if (!canRead(await getDocRole(credential, id))) return forbidden()

  const payload = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const body = cleanBody(payload.body)
  if (!body) return NextResponse.json({ error: "body required (1..8000 chars)" }, { status: 400 })

  try {
    const me = requesterFrom(req, credential)
    const owned = await ownMessage(id, m, requesterKey(me))
    if ("status" in owned) return NextResponse.json({ error: "not found" }, { status: owned.status })

    const stamps = parseSpaceMentions(body)
    const updated = await query(
      `UPDATE dashboard.workspace_messages
       SET body = $1, mentions = $2, member_ids = $3, here = $4, has_agent = $5,
           doc_refs = $6, edited_at = now()
       WHERE id = $7 AND space_id = $8 RETURNING *`,
      [body, stamps.agentTypes, stamps.memberIds, stamps.here, stamps.hasAgent, stamps.docRefs, m, id],
    )
    const message = spaceMessageFromRow(updated.rows[0] as Record<string, unknown>, id)
    if (!message) return NextResponse.json({ error: "db" }, { status: 500 })
    return NextResponse.json({ message })
  } catch (error) {
    console.error("[workspace/messages PATCH]", error)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; m: string }> },
) {
  const { id, m } = await params
  const credential = workspaceCredential(req)
  if (!credential) return unauthorized()
  if (await checkAgentAccess(id, credential, req.headers.get("x-agent-type"), "write"))
    return forbidden()
  if (!canRead(await getDocRole(credential, id))) return forbidden()

  try {
    const me = requesterFrom(req, credential)
    const owned = await ownMessage(id, m, requesterKey(me))
    if ("status" in owned) return NextResponse.json({ error: "not found" }, { status: owned.status })

    await query(
      `UPDATE dashboard.workspace_messages
       SET body = '', deleted_at = now() WHERE id = $1 AND space_id = $2`,
      [m, id],
    )
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[workspace/messages DELETE]", error)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}
