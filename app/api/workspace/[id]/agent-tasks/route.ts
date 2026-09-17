/**
 * GET /api/workspace/[id]/agent-tasks — kartu task per thread/Space (Phase 3).
 *
 * ?thread=<root> untuk panel thread; tanpa filter = seluruh Space.
 * Gate baca existing (dipakai juga viewer read-only).
 */
import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { getDocRole, canRead, checkAgentAccess } from "@/lib/workspaceAccess"
import { workspaceCredential, unauthorized, forbidden } from "@/lib/workspaceAuth"
import { spaceAgentTaskFromRow } from "@/lib/spaceAgent"

export const runtime = "nodejs"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const credential = workspaceCredential(req)
  if (!credential) return unauthorized()
  if (await checkAgentAccess(id, credential, req.headers.get("x-agent-type"), "read"))
    return forbidden()
  if (!canRead(await getDocRole(credential, id))) return forbidden()

  const thread = req.nextUrl.searchParams.get("thread")?.slice(0, 128)
  try {
    const result = thread
      ? await query(
          `SELECT * FROM dashboard.workspace_agent_tasks
           WHERE space_id = $1 AND thread_root = $2 ORDER BY created_at ASC`,
          [id, thread],
        )
      : await query(
          `SELECT * FROM dashboard.workspace_agent_tasks
           WHERE space_id = $1 ORDER BY created_at DESC LIMIT 100`,
          [id],
        )
    const tasks = []
    for (const row of result.rows as Record<string, unknown>[]) {
      const t = spaceAgentTaskFromRow(row)
      if (t) tasks.push(t)
    }
    return NextResponse.json({ tasks })
  } catch (error) {
    console.error("[workspace/agent-tasks GET]", error)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}
