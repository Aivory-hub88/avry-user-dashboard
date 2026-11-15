import { NextRequest, NextResponse } from "next/server"
import * as Y from "yjs"
import { workspaceCredential, authorizeDocFallback, unauthorized, forbidden, workspacePlanDenied } from "@/lib/workspaceAuth"
import { checkAgentAccess } from "@/lib/workspaceAccess"
import {
  WorkspaceDenied,
  loadDbDoc,
  saveDbDoc,
  rowsFromDbDoc,
  parseDbRow,
  getWipLimits,
  getFieldDefs,
  cleanCells,
  wipExceeded,
  withResolvedRollups,
  MAX_DESCRIPTION_LEN,
} from "@/lib/workspaceDb"
import { recordWorkspaceActivity } from "@/lib/workspaceActivity"
import { syncDescriptionMentions, recordAssignments } from "@/lib/workspaceMentions"
import { addedAssignees, assigneeMirror, cleanAssignees, cleanOwner, rowAssignees, type PersonRef } from "@/lib/workspaceDbModel"
import { getAutomationRules, runStatusAutomations } from "@/lib/workspaceAutomations"
import { indexRow, removeRowIndex, rowText, workspaceOf } from "@/lib/workspaceIndex"

export const runtime = "nodejs"

const SCALAR_FIELDS = new Set(["title", "status", "priority", "assignee", "start", "due", "description"])

function cleanPatch(patch: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(patch)) {
    if (!SCALAR_FIELDS.has(k) || typeof v !== "string") continue
    const cap = k === "title" ? 200 : k === "description" ? MAX_DESCRIPTION_LEN : k === "assignee" ? 100 : k === "start" || k === "due" ? 20 : 16
    out[k] = v.slice(0, cap)
  }
  if (out.priority !== undefined && out.priority !== "Low" && out.priority !== "Med" && out.priority !== "High") {
    out.priority = "Med"
  }
  return out
}

/**
 * People part of a patch: `assignees` (typed list) wins over the legacy
 * `assignee` string; a legacy string naming an agent becomes typed, any
 * other text stays legacy (unlinked). `owner` accepts a person or null.
 */
function peoplePatch(patch: Record<string, unknown>): {
  assignees?: PersonRef[] | "legacy"
  legacyText?: string
  owner?: PersonRef | null
} {
  const out: ReturnType<typeof peoplePatch> = {}
  if (Array.isArray(patch.assignees)) {
    out.assignees = cleanAssignees(patch.assignees)
  } else if (typeof patch.assignee === "string") {
    const text = patch.assignee.trim().slice(0, 100)
    const typed = rowAssignees(undefined, text)
    if (typed.length > 0 || !text) out.assignees = typed
    else {
      out.assignees = "legacy"
      out.legacyText = text
    }
  }
  if (patch.owner === null) out.owner = null
  else if (patch.owner !== undefined) {
    const o = cleanOwner(patch.owner)
    if (o) out.owner = o
  }
  return out
}

async function allowPg(cred: NonNullable<ReturnType<typeof workspaceCredential>>, id: string): Promise<boolean> {
  return cred.kind === "service" ? true : authorizeDocFallback(cred, id)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; rowId: string }> }) {
  const { id, rowId } = await params
  const cred = workspaceCredential(req)
  if (!cred) return unauthorized()
  const planDenied = await workspacePlanDenied(req, cred)
  if (planDenied) return planDenied
  const assertedAgent = req.headers.get("x-agent-type") || req.headers.get("X-Agent-Type")
  if (await checkAgentAccess(id, cred, assertedAgent, 'write')) return forbidden()
  const agentType = assertedAgent || "user"
  let patch: Record<string, unknown>
  try {
    patch = await req.json()
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 })
  }
  const clean = cleanPatch(patch)
  // Assignee is handled by peoplePatch (typed + mirror), not as a raw scalar.
  delete clean.assignee
  const people = peoplePatch(patch)
  const hasPeople = people.assignees !== undefined || people.owner !== undefined
  const hasCells = patch.cells !== undefined
  if (Object.keys(clean).length === 0 && !hasCells && !hasPeople) return NextResponse.json({ error: "nothing to update" }, { status: 400 })

  try {
    const doc = await loadDbDoc(id, cred, agentType, await allowPg(cred, id))
    const arr = doc.getArray<Y.Map<unknown>>("database")
    const idx = arr.toArray().findIndex((m) => (m.get("id") as string) === rowId)
    if (idx < 0) return NextResponse.json({ error: "not found" }, { status: 404 })
    // WIP gate (F2-4): moving into a full column is rejected, not queued.
    if (clean.status !== undefined) {
      const limited = wipExceeded(rowsFromDbDoc(doc), clean.status, await getWipLimits(id), rowId)
      if (limited !== null) {
        return NextResponse.json({ error: "wip-exceeded", limit: limited }, { status: 409 })
      }
    }
    const m = arr.get(idx) as Y.Map<unknown>
    // Invariant start <= due (mirrors client clamp): prefer the just-patched side.
    const mergedStart = clean.start ?? ((m.get("start") as string) ?? "")
    const mergedDue = clean.due ?? ((m.get("due") as string) ?? "")
    if (mergedStart && mergedDue && mergedStart > mergedDue) {
      if (clean.start !== undefined) clean.start = mergedDue
      else if (clean.due !== undefined) clean.due = mergedStart
    }
    const prevStatus = (m.get("status") as string) ?? "Todo"
    // Custom cells merge (never replace): concurrent editors on different
    // fields must not clobber each other. Defs load BEFORE the transaction
    // (yrs transactions are sync-only, no awaits inside).
    let mergedCells: Record<string, string | number | boolean | string[]> | null = null
    if (patch.cells !== undefined) {
      mergedCells = { ...parseDbRow(m).cells, ...cleanCells(patch.cells, await getFieldDefs(id)) }
    }
    const prevAssignees = parseDbRow(m).assignees
    doc.transact(() => {
      for (const [k, v] of Object.entries(clean)) m.set(k, v)
      if (mergedCells) m.set("cells", mergedCells)
      if (people.assignees === "legacy") {
        m.delete("assignees")
        m.set("assignee", people.legacyText ?? "")
      } else if (people.assignees !== undefined) {
        m.set("assignees", people.assignees)
        m.set("assignee", assigneeMirror(people.assignees))
      }
      if (people.owner !== undefined) m.set("owner", people.owner)
    }, agentType)
    const actorName = cred.kind === "service" ? agentType.replace(/_/g, " ") : (cred.user.email ?? cred.user.user_id)
    const automated = await runStatusAutomations({
      doc,
      rowId,
      prevStatus,
      wipLimits: await getWipLimits(id),
      actorName,
      origin: agentType,
      getRules: () => getAutomationRules(id),
    })
    await saveDbDoc(id, doc, cred, agentType)
    // Diff after automations too (a rule may assign an agent on entry).
    const afterRow = parseDbRow(m)
    const added = addedAssignees(prevAssignees, afterRow.assignees)
    if (added.length > 0) {
      await recordAssignments({ docId: id, rowId, credential: cred, agentType, added, title: afterRow.title })
    }
    await recordWorkspaceActivity({
      docId: id,
      credential: cred,
      agentType,
      action: "database.row_updated",
      summary: `Updated task ${rowId}`,
      targetType: "database-row",
      targetId: rowId,
      metadata: {
        ...clean,
        ...(people.assignees !== undefined ? { assignee: afterRow.assignee } : {}),
        ...(people.owner !== undefined ? { owner: afterRow.owner?.kind === "user" ? afterRow.owner.id : null } : {}),
      },
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
    const updated = parseDbRow(arr.get(idx) as Y.Map<unknown>)
    const [resolved] = await withResolvedRollups([updated], await getFieldDefs(id), cred, agentType, await allowPg(cred, id))
    if (clean.description !== undefined) {
      await syncDescriptionMentions({ docId: id, rowId, credential: cred, agentType, source: "description", text: clean.description })
    }
    // Semantic reindex on text-affecting edits (best-effort, non-blocking).
    if (clean.title !== undefined || clean.description !== undefined || people.assignees !== undefined) {
      const fresh = parseDbRow(arr.get(idx) as Y.Map<unknown>)
      void indexRow(id, rowId, await workspaceOf(id), rowText(fresh)).catch(() => {})
    }
    return NextResponse.json({ id: rowId, patched: {
      ...clean,
      ...(people.assignees !== undefined ? { assignee: afterRow.assignee, assignees: afterRow.assignees } : {}),
      ...(people.owner !== undefined ? { owner: afterRow.owner } : {}),
    }, ...(mergedCells ? { cells: mergedCells } : {}), rollups: resolved?.cells ?? {} })
  } catch (e) {
    if (e instanceof WorkspaceDenied) return NextResponse.json({ error: "forbidden" }, { status: e.status })
    console.error("[workspace/database PATCH]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; rowId: string }> }) {
  const { id, rowId } = await params
  const cred = workspaceCredential(req)
  if (!cred) return unauthorized()
  const planDenied = await workspacePlanDenied(req, cred)
  if (planDenied) return planDenied
  const assertedAgent = req.headers.get("x-agent-type") || req.headers.get("X-Agent-Type")
  if (await checkAgentAccess(id, cred, assertedAgent, 'write')) return forbidden()
  const agentType = assertedAgent || "user"
  try {
    const doc = await loadDbDoc(id, cred, agentType, await allowPg(cred, id))
    const arr = doc.getArray<Y.Map<unknown>>("database")
    const idx = arr.toArray().findIndex((m) => (m.get("id") as string) === rowId)
    if (idx < 0) return NextResponse.json({ error: "not found" }, { status: 404 })
    doc.transact(() => arr.delete(idx, 1), agentType)
    await saveDbDoc(id, doc, cred, agentType)
    void removeRowIndex(id, rowId).catch(() => {})
    await recordWorkspaceActivity({
      docId: id,
      credential: cred,
      agentType,
      action: "database.row_deleted",
      summary: `Deleted task ${rowId}`,
      targetType: "database-row",
      targetId: rowId,
    })
    return NextResponse.json({ ok: true, id: rowId })
  } catch (e) {
    if (e instanceof WorkspaceDenied) return NextResponse.json({ error: "forbidden" }, { status: e.status })
    console.error("[workspace/database DELETE]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}
