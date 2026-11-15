import { NextRequest, NextResponse } from "next/server"
import { workspaceCredential, unauthorized, forbidden, workspacePlanDenied } from "@/lib/workspaceAuth"
import { canReadDocId } from "@/lib/workspaceAccess"
import { tasksInvolving } from "@/lib/workspaceTaskIndex"
import type { MyTask } from "@/lib/myTasks"

export const runtime = "nodejs"

/**
 * GET /api/workspace/tasks/mine — open tasks across every room the caller
 * can read where they are an assignee, the owner, a follower or the creator
 * (from dashboard.workspace_task_index). Rooms the caller can no longer
 * read are dropped, never leaked. People only: agents have no "My tasks".
 */
export async function GET(req: NextRequest) {
  const cred = workspaceCredential(req)
  if (!cred) return unauthorized()
  const planDenied = await workspacePlanDenied(req, cred)
  if (planDenied) return planDenied
  if (cred.kind !== "user") return forbidden()
  try {
    const all = await tasksInvolving(`user:${cred.user.user_id}`)
    const readable = new Map<string, boolean>()
    for (const docId of new Set(all.map((t) => t.docId))) {
      readable.set(docId, await canReadDocId(cred, docId).catch(() => false))
    }
    const tasks: MyTask[] = all.filter((t) => readable.get(t.docId))
    return NextResponse.json({ tasks })
  } catch (e) {
    console.error("[workspace/tasks/mine GET]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}
