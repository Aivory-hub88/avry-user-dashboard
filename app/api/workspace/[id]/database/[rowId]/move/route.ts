import { NextRequest, NextResponse } from "next/server"
import * as Y from "yjs"
import { workspaceCredential, authorizeDocFallback, unauthorized, forbidden, workspacePlanDenied } from "@/lib/workspaceAuth"
import { checkAgentAccess } from "@/lib/workspaceAccess"
import {
  WorkspaceDenied,
  loadDbDoc,
  saveDbDoc,
  parseDbRow,
  rowsFromDbDoc,
  getWipLimits,
  getStatusDefs,
  getFieldDefs,
  wipExceeded,
} from "@/lib/workspaceDb"
import { recordWorkspaceActivity } from "@/lib/workspaceActivity"
import { notifyFollowers, recordFieldAssignments } from "@/lib/workspaceMentions"
import { recordUnblocked } from "@/lib/workspaceTaskEvents"
import { entersClosed, entersDone, entersInProgress, missingOnDone, openBlockers, resolveStatus } from "@/lib/workspaceDbModel"
import { automatedFieldAdds, getAutomationRules, runStatusAutomations } from "@/lib/workspaceAutomations"

export const runtime = "nodejs"

// Dedicated status-move endpoint (Fase 3).
// Why not plain PATCH: drag-and-drop clients need one atomic "move card"
// call with the WIP verdict inline (409 wip-exceeded) instead of a generic
// field patch. Single purpose, same Yjs `database` array as everything else.

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; rowId: string }> }) {
  const { id, rowId } = await params
  const cred = workspaceCredential(req)
  if (!cred) return unauthorized()
  const planDenied = await workspacePlanDenied(req, cred)
  if (planDenied) return planDenied
  const assertedAgent = req.headers.get("x-agent-type") || req.headers.get("X-Agent-Type")
  if (await checkAgentAccess(id, cred, assertedAgent, 'write')) return forbidden()
  const agentType = assertedAgent || "user"

  let body: { status?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 })
  }
  if (typeof body.status !== "string" || !body.status.trim()) return NextResponse.json({ error: "status required" }, { status: 400 })
  // One of the room's statuses (legacy Todo/Doing/Done map onto their group).
  const statuses = await getStatusDefs(id)
  const status = resolveStatus(statuses, body.status)
  if (!status) {
    return NextResponse.json({ error: "invalid status", statuses: statuses.map((s) => s.name) }, { status: 400 })
  }

  try {
    const allowPg = cred.kind === "service" ? true : await authorizeDocFallback(cred, id)
    const doc = await loadDbDoc(id, cred, agentType, allowPg)
    const arr = doc.getArray<Y.Map<unknown>>("database")
    const idx = arr.toArray().findIndex((m) => (m.get("id") as string) === rowId)
    if (idx < 0) return NextResponse.json({ error: "not found" }, { status: 404 })
    const m = arr.get(idx) as Y.Map<unknown>
    const from = (m.get("status") as string) ?? "Todo"
    if (from === status) return NextResponse.json({ id: rowId, status, moved: false })
    const limited = wipExceeded(rowsFromDbDoc(doc), status, await getWipLimits(id), rowId)
    if (limited !== null) {
      return NextResponse.json({ error: "wip-exceeded", limit: limited }, { status: 409 })
    }
    doc.transact(() => m.set("status", status), agentType)
    const actorName = cred.kind === "service" ? agentType.replace(/_/g, " ") : (cred.user.email ?? cred.user.user_id)
    const automated = await runStatusAutomations({
      doc,
      rowId,
      prevStatus: from,
      wipLimits: await getWipLimits(id),
      actorName,
      origin: agentType,
      getRules: () => getAutomationRules(id),
      getFields: () => getFieldDefs(id),
    })
    await saveDbDoc(id, doc, cred, agentType)
    await recordWorkspaceActivity({
      docId: id,
      credential: cred,
      agentType,
      action: "database.row_moved",
      summary: `Moved task ${rowId} from ${from} to ${status}`,
      targetType: "database-row",
      targetId: rowId,
      metadata: { from, to: status },
    })
    if (automated.length > 0) {
      await recordWorkspaceActivity({
        docId: id,
        credential: cred,
        agentType,
        action: "database.automation",
        summary: `Automation ran on task ${rowId}: ${automated.map((a) => a.ruleName).join(", ")}`,
        targetType: "database-row",
        targetId: rowId,
        metadata: { applied: automated },
      })
    }
    // People an automation put on a person field hear about it ("set you as Reviewer").
    const fieldAdds = automatedFieldAdds(automated)
    if (fieldAdds.length > 0) {
      await recordFieldAssignments({ docId: id, rowId, credential: cred, agentType, fields: fieldAdds, title: parseDbRow(m).title })
    }
    // Followers hear when the task lands in a done-group status (after
    // automations, which may move it on); closing it (done or canceled)
    // frees the tasks it was the last open blocker of.
    const after = parseDbRow(m)
    if (entersDone(statuses, from, after.status)) {
      await notifyFollowers({ docId: id, rowId, credential: cred, agentType, followers: after.followers, kind: "status_done", excerpt: after.title })
    }
    if (entersClosed(statuses, from, after.status)) {
      await recordUnblocked({ docId: id, credential: cred, agentType, statuses }, rowsFromDbDoc(doc), rowId)
    }
    // Moving a blocked task into an in-progress status is allowed, but the caller is told.
    const waitingOn = entersInProgress(statuses, from, after.status) ? openBlockers(rowsFromDbDoc(doc), after, statuses).map((b) => ({ id: b.id, title: b.title, status: b.status })) : []
    // Same for a done-group status while a "required before Done" field is empty
    // (soft on purpose: UI edits write Yjs directly and can't be gated, and a 400
    // would strand agents/MCP callers). `warning: "blocked"` wins when both apply.
    const missing = entersDone(statuses, from, after.status) ? missingOnDone(statuses, await getFieldDefs(id), from, after.status, after.cells) : []
    return NextResponse.json({
      id: rowId,
      status,
      moved: true,
      from,
      automated: automated.length > 0 ? automated : undefined,
      ...(waitingOn.length > 0 ? { warning: "blocked", blockedBy: waitingOn } : missing.length > 0 ? { warning: "required_fields" } : {}),
      ...(missing.length > 0 ? { missingFields: missing } : {}),
    })
  } catch (e) {
    if (e instanceof WorkspaceDenied) return NextResponse.json({ error: "forbidden" }, { status: e.status })
    console.error("[workspace/move POST]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}
