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
  getStatusDefs,
  cleanCells,
  wipExceeded,
  withResolvedRollups,
  MAX_DESCRIPTION_LEN,
} from "@/lib/workspaceDb"
import { recordWorkspaceActivity } from "@/lib/workspaceActivity"
import { syncDescriptionMentions, recordAssignments } from "@/lib/workspaceMentions"
import {
  addFollowers,
  addedAssignees,
  assigneeMirror,
  blockedByProblem,
  cleanAssignees,
  cleanBlockedBy,
  cleanOwner,
  cleanParentId,
  descendantIds,
  entersInProgress,
  openBlockers,
  resolveStatus,
  parentProblem,
  rowAssignees,
  rowChanges,
  MAX_BLOCKED_BY,
  type PersonRef,
} from "@/lib/workspaceDbModel"
import { recordRowChanges } from "@/lib/workspaceTaskEvents"
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
  // Structure: `parentId` (string | null) and `blockedBy` (row ids), checked against the doc below.
  const hasParent = patch.parentId !== undefined
  const hasBlockedBy = patch.blockedBy !== undefined
  if (hasBlockedBy && (!Array.isArray(patch.blockedBy) || patch.blockedBy.length > MAX_BLOCKED_BY)) {
    return NextResponse.json({ error: "invalid blockedBy", reason: Array.isArray(patch.blockedBy) ? "too_many" : "shape" }, { status: 400 })
  }
  if (hasParent && patch.parentId !== null && typeof patch.parentId !== "string") {
    return NextResponse.json({ error: "invalid parentId", reason: "shape" }, { status: 400 })
  }
  // Status must be one of the room's (legacy Todo/Doing/Done map onto their group).
  const statuses = await getStatusDefs(id)
  if (clean.status !== undefined) {
    const resolved = resolveStatus(statuses, clean.status)
    if (!resolved) {
      return NextResponse.json({ error: "invalid status", statuses: statuses.map((s) => s.name) }, { status: 400 })
    }
    clean.status = resolved
  }
  if (Object.keys(clean).length === 0 && !hasCells && !hasPeople && !hasParent && !hasBlockedBy) return NextResponse.json({ error: "nothing to update" }, { status: 400 })

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
    const allRows = rowsFromDbDoc(doc)
    const parentId = hasParent ? cleanParentId(patch.parentId) : undefined
    if (parentId !== undefined) {
      const why = parentProblem(allRows, rowId, parentId)
      if (why) return NextResponse.json({ error: "invalid parentId", reason: why }, { status: 400 })
    }
    let blockedBy: string[] | undefined
    if (hasBlockedBy) {
      if ((patch.blockedBy as unknown[]).some((b) => b === rowId)) {
        return NextResponse.json({ error: "invalid blockedBy", reason: "self" }, { status: 400 })
      }
      blockedBy = cleanBlockedBy(patch.blockedBy, rowId)
      const why = blockedByProblem(allRows, rowId, blockedBy)
      if (why) return NextResponse.json({ error: "invalid blockedBy", reason: why }, { status: 400 })
    }
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
    const prevRow = parseDbRow(m)
    const prevAssignees = prevRow.assignees
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
      if (parentId !== undefined) m.set("parentId", parentId)
      if (blockedBy !== undefined) m.set("blockedBy", blockedBy)
      // New owner / assignees start following the task.
      if (people.owner || (Array.isArray(people.assignees) && people.assignees.length > 0)) {
        const add = [people.owner ?? null, ...(Array.isArray(people.assignees) ? people.assignees : [])]
        m.set("followers", addFollowers(prevRow.followers, add))
      }
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
    // Status / due / owner get their own activity entries (+ follower
    // notices); the generic "updated" entry covers the remaining fields.
    const changes = rowChanges(prevRow, afterRow)
    await recordRowChanges(
      { docId: id, rowId, credential: cred, agentType, title: afterRow.title, followers: afterRow.followers, rows: rowsFromDbDoc(doc), statuses },
      changes,
    )
    const tracked = new Set(["status", "due"])
    const otherKeys = Object.keys(clean).filter((k) => !tracked.has(k))
    if (
      otherKeys.length > 0 ||
      mergedCells ||
      people.assignees !== undefined ||
      parentId !== undefined ||
      blockedBy !== undefined ||
      (changes.length === 0 && people.owner === undefined)
    ) {
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
          ...(parentId !== undefined ? { parentId } : {}),
          ...(blockedBy !== undefined ? { blockedBy } : {}),
        },
      })
    }
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
    // Moving a blocked task into an in-progress status is allowed, but the caller is told.
    const waitingOn =
      changes.some((c) => c.kind === "status" && entersInProgress(statuses, c.from, c.to))
        ? openBlockers(rowsFromDbDoc(doc), afterRow, statuses).map((b) => ({ id: b.id, title: b.title, status: b.status }))
        : []
    return NextResponse.json({ id: rowId, patched: {
      ...clean,
      ...(people.assignees !== undefined ? { assignee: afterRow.assignee, assignees: afterRow.assignees } : {}),
      ...(people.owner !== undefined ? { owner: afterRow.owner } : {}),
      ...(parentId !== undefined ? { parentId: afterRow.parentId } : {}),
      ...(blockedBy !== undefined ? { blockedBy: afterRow.blockedBy } : {}),
    }, ...(mergedCells ? { cells: mergedCells } : {}), rollups: resolved?.cells ?? {},
    ...(waitingOn.length > 0 ? { warning: "blocked", blockedBy: waitingOn } : {}) })
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
  const subtasks = req.nextUrl.searchParams.get("subtasks") === "delete" ? "delete" : "keep"
  try {
    const doc = await loadDbDoc(id, cred, agentType, await allowPg(cred, id))
    const arr = doc.getArray<Y.Map<unknown>>("database")
    const rows = rowsFromDbDoc(doc)
    if (!rows.some((r) => r.id === rowId)) return NextResponse.json({ error: "not found" }, { status: 404 })
    // A parent's sub-tasks are deleted with it (?subtasks=delete) or kept as
    // top-level tasks (default). Other tasks stop waiting on deleted rows.
    const children = descendantIds(rows, rowId)
    const removed = new Set([rowId, ...(subtasks === "delete" ? children : [])])
    doc.transact(() => {
      const maps = arr.toArray()
      for (let i = maps.length - 1; i >= 0; i--) {
        const m = maps[i]
        const rid = m.get("id") as string
        if (removed.has(rid)) {
          arr.delete(i, 1)
          continue
        }
        if (m.get("parentId") === rowId) m.set("parentId", null)
        const bb = m.get("blockedBy")
        if (Array.isArray(bb) && bb.some((b) => removed.has(b as string))) {
          m.set("blockedBy", bb.filter((b) => !removed.has(b as string)))
        }
      }
    }, agentType)
    await saveDbDoc(id, doc, cred, agentType)
    for (const rid of removed) void removeRowIndex(id, rid).catch(() => {})
    await recordWorkspaceActivity({
      docId: id,
      credential: cred,
      agentType,
      action: "database.row_deleted",
      summary:
        children.length === 0
          ? `Deleted task ${rowId}`
          : subtasks === "delete"
            ? `Deleted task ${rowId} and ${children.length} sub-task${children.length === 1 ? "" : "s"}`
            : `Deleted task ${rowId} (kept ${children.length} sub-task${children.length === 1 ? "" : "s"})`,
      targetType: "database-row",
      targetId: rowId,
      metadata: children.length > 0 ? { subtasks, children } : undefined,
    })
    return NextResponse.json({ ok: true, id: rowId, deleted: [...removed] })
  } catch (e) {
    if (e instanceof WorkspaceDenied) return NextResponse.json({ error: "forbidden" }, { status: e.status })
    console.error("[workspace/database DELETE]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}
