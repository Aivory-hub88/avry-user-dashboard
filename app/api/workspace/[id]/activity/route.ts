import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { getDocRole, canWrite } from "@/lib/workspaceAccess"
import { workspaceCredential, unauthorized, forbidden } from "@/lib/workspaceAuth"
import { recordWorkspaceActivity } from "@/lib/workspaceActivity"

export const runtime = "nodejs"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const credential = workspaceCredential(req)
  if (!credential) return unauthorized()
  if (!(await getDocRole(credential, id))) return forbidden()
  try {
    const result = await query(
      `SELECT id, actor_type, actor_id, actor_name, action, target_type, target_id, summary, status, metadata, created_at
       FROM dashboard.workspace_activity
       WHERE doc_id = $1
       ORDER BY created_at DESC
       LIMIT 30`,
      [id],
    )
    return NextResponse.json({ activities: result.rows })
  } catch (error) {
    console.error("[workspace/activity GET]", error)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const credential = workspaceCredential(req)
  if (!credential) return unauthorized()
  if (!canWrite(await getDocRole(credential, id))) return forbidden()
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const action = typeof body.action === "string" ? body.action.slice(0, 80) : "workspace.updated"
  const summary = typeof body.summary === "string" ? body.summary.slice(0, 500) : "Workspace updated"
  try {
    await recordWorkspaceActivity({
      docId: id,
      credential,
      agentType: req.headers.get("x-agent-type") ?? "user",
      action,
      summary,
      targetType: typeof body.targetType === "string" ? body.targetType : undefined,
      targetId: typeof body.targetId === "string" ? body.targetId : undefined,
      status: body.status === "proposed" || body.status === "rejected" || body.status === "failed" ? body.status : "applied",
      metadata: typeof body.metadata === "object" && body.metadata !== null ? body.metadata as Record<string, unknown> : {},
    })
    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (error) {
    console.error("[workspace/activity POST]", error)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}
