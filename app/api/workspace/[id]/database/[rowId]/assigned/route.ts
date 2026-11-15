import { NextRequest, NextResponse } from "next/server"
import * as Y from "yjs"
import { workspaceCredential, authorizeDocFallback, unauthorized, forbidden, workspacePlanDenied } from "@/lib/workspaceAuth"
import { checkAgentAccess } from "@/lib/workspaceAccess"
import { WorkspaceDenied, loadDbDoc, parseDbRow } from "@/lib/workspaceDb"
import { recordAssignments } from "@/lib/workspaceMentions"
import { cleanAssignees } from "@/lib/workspaceDbModel"

export const runtime = "nodejs"

/**
 * POST /api/workspace/[id]/database/[rowId]/assigned { added: PersonRef[] }
 *
 * The Tasks UI edits rows straight through Yjs (no REST round trip), so the
 * server never sees the assignee diff. After a local assign the client posts
 * who it just added; this drops their inbox rows. Same write gate as every
 * row edit, and the row must exist. Refs are validated (known agent types,
 * non-empty user ids); readers only ever see rows of docs they can read.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; rowId: string }> }) {
  const { id, rowId } = await params
  const cred = workspaceCredential(req)
  if (!cred) return unauthorized()
  const planDenied = await workspacePlanDenied(req, cred)
  if (planDenied) return planDenied
  const assertedAgent = req.headers.get("x-agent-type") || req.headers.get("X-Agent-Type")
  if (await checkAgentAccess(id, cred, assertedAgent, "write")) return forbidden()
  const agentType = assertedAgent || "user"
  let body: { added?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 })
  }
  const added = cleanAssignees(body.added)
  if (added.length === 0) return NextResponse.json({ error: "added required" }, { status: 400 })
  try {
    const allowPg = cred.kind === "service" ? true : await authorizeDocFallback(cred, id)
    const doc = await loadDbDoc(id, cred, agentType, allowPg)
    const m = doc
      .getArray<Y.Map<unknown>>("database")
      .toArray()
      .find((x) => (x.get("id") as string) === rowId)
    if (!m) return NextResponse.json({ error: "not found" }, { status: 404 })
    await recordAssignments({ docId: id, rowId, credential: cred, agentType, added, title: parseDbRow(m).title })
    return NextResponse.json({ ok: true, notified: added.length })
  } catch (e) {
    if (e instanceof WorkspaceDenied) return NextResponse.json({ error: "forbidden" }, { status: e.status })
    console.error("[workspace/database assigned POST]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}
