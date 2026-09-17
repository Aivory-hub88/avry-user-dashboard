/**
 * GET /api/workspace/[id]/thread?root= — 1 thread utuh (Phase 1, read-only).
 *
 * Root + replies oldest-first (cap 200) + topic row.
 * 400 bila ?root= hilang, 404 bila root tidak ada di Space ini.
 */
import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { getDocRole, canRead, checkAgentAccess } from "@/lib/workspaceAccess"
import { workspaceCredential, unauthorized, forbidden } from "@/lib/workspaceAuth"
import { spaceMessageFromRow, spaceTopicFromRow, THREAD_MAX_REPLIES } from "@/lib/spaceThreads"

export const runtime = "nodejs"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const credential = workspaceCredential(req)
  if (!credential) return unauthorized()
  if (await checkAgentAccess(id, credential, req.headers.get("x-agent-type"), "read"))
    return forbidden()
  if (!canRead(await getDocRole(credential, id))) return forbidden()

  const root = req.nextUrl.searchParams.get("root")?.slice(0, 128)
  if (!root) return NextResponse.json({ error: "root required" }, { status: 400 })

  try {
    const rootRes = await query(
      `SELECT * FROM dashboard.workspace_messages
       WHERE id = $1 AND space_id = $2 AND thread_root IS NULL`,
      [root, id],
    )
    if (rootRes.rows.length === 0)
      return NextResponse.json({ error: "not found" }, { status: 404 })
    const rootMsg = spaceMessageFromRow(rootRes.rows[0] as Record<string, unknown>, id)
    if (!rootMsg) return NextResponse.json({ error: "db" }, { status: 500 })

    const repliesRes = await query(
      `SELECT * FROM dashboard.workspace_messages
       WHERE thread_root = $1 AND space_id = $2
       ORDER BY created_at ASC
       LIMIT ${THREAD_MAX_REPLIES}`,
      [root, id],
    )
    const replies = []
    for (const row of repliesRes.rows as Record<string, unknown>[]) {
      const msg = spaceMessageFromRow(row, id)
      if (msg) replies.push(msg)
    }

    const topicRes = await query(
      `SELECT * FROM dashboard.workspace_topics WHERE thread_root = $1`,
      [root],
    )
    const topic =
      topicRes.rows.length > 0
        ? spaceTopicFromRow(topicRes.rows[0] as Record<string, unknown>)
        : null

    return NextResponse.json({
      root: rootMsg,
      replies,
      topic,
      truncated: repliesRes.rows.length === THREAD_MAX_REPLIES,
    })
  } catch (error) {
    console.error("[workspace/thread GET]", error)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}
