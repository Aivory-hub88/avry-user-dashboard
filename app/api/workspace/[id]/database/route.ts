import { NextRequest, NextResponse } from "next/server"
import * as Y from "yjs"
import { workspaceCredential, authorizeDocFallback, unauthorized, forbidden, workspacePlanDenied } from "@/lib/workspaceAuth"
import { checkAgentAccess } from "@/lib/workspaceAccess"
import {
  WorkspaceDenied,
  loadDbDoc,
  saveDbDoc,
  rowsFromDbDoc,
  newDbRowId,
  dbRowToYMap,
  getWipLimits,
  getFieldDefs,
  getStatusDefs,
  cleanCells,
  wipExceeded,
  withResolvedRollups,
  actorRef,
  MAX_DESCRIPTION_LEN,
  type DbRow,
} from "@/lib/workspaceDb"
import { recordWorkspaceActivity } from "@/lib/workspaceActivity"
import { indexRow, rowText, workspaceOf } from "@/lib/workspaceIndex"
import { getAutomationRules, runStatusAutomations } from "@/lib/workspaceAutomations"
import { recordAssignments } from "@/lib/workspaceMentions"
import {
  addFollowers,
  assigneeMirror,
  blockedByProblem,
  cleanAssignees,
  cleanBlockedBy,
  cleanOwner,
  cleanParentId,
  defaultStatus,
  parentProblem,
  personCellsProblem,
  resolveStatus,
  rowAssignees,
  MAX_BLOCKED_BY,
  type PersonRef,
} from "@/lib/workspaceDbModel"

export const runtime = "nodejs"

type RowInput = Omit<DbRow, "id" | "comments" | "cells" | "createdBy" | "createdAt" | "followers" | "parentId" | "blockedBy">

/** Typed assignees win; else the legacy `assignee` text (agent → typed). */
function assigneesInput(body: Partial<DbRow>): { assignees: PersonRef[]; assignee: string } {
  if (Array.isArray(body.assignees)) {
    const assignees = cleanAssignees(body.assignees)
    return { assignees, assignee: assigneeMirror(assignees) }
  }
  const legacy = (body.assignee ?? "").toString().slice(0, 100)
  const assignees = rowAssignees(undefined, legacy)
  return { assignees, assignee: assignees.length > 0 ? assigneeMirror(assignees) : legacy }
}

/** `status` is already resolved against the room's statuses. */
function cleanRowInput(body: Partial<DbRow>, status: string): RowInput {
  const priority = body.priority === "Low" || body.priority === "High" ? body.priority : "Med"
  const due = (body.due ?? "").toString().slice(0, 20)
  let start = (body.start ?? "").toString().slice(0, 20)
  // Invariant: start <= due. Clamp instead of rejecting (client enforces too).
  if (start && due && start > due) start = due
  return {
    title: (body.title ?? "Untitled").toString().slice(0, 200),
    status,
    priority,
    ...assigneesInput(body),
    owner: cleanOwner(body.owner),
    start,
    due,
    description: (body.description ?? "").toString().slice(0, MAX_DESCRIPTION_LEN),
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const cred = workspaceCredential(req)
  if (!cred) return unauthorized()
  const planDenied = await workspacePlanDenied(req, cred)
  if (planDenied) return planDenied
  const agent = req.headers.get("x-agent-type")
  // Agent gate: invited agents read per their grant; revoked/unknown agents 403
  // (also covers the pg-fallback path when collab is down).
  if (await checkAgentAccess(id, cred, agent, 'read')) return forbidden()
  try {
    const allowPg = cred.kind === "service" ? true : await authorizeDocFallback(cred, id)
    const doc = await loadDbDoc(id, cred, agent ?? undefined, allowPg)
    const rows = await withResolvedRollups(rowsFromDbDoc(doc), await getFieldDefs(id), cred, agent ?? undefined, allowPg)
    return NextResponse.json({ id, rows, statuses: await getStatusDefs(id) })
  } catch (e) {
    if (e instanceof WorkspaceDenied) return NextResponse.json({ error: "forbidden" }, { status: e.status })
    console.error("[workspace/database GET]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const cred = workspaceCredential(req)
  if (!cred) return unauthorized()
  const planDenied = await workspacePlanDenied(req, cred)
  if (planDenied) return planDenied
  const assertedAgent = req.headers.get("x-agent-type") || req.headers.get("X-Agent-Type")
  // Agent gate: only invited editor+ agents may write (also covers pg fallback).
  if (await checkAgentAccess(id, cred, assertedAgent, 'write')) return forbidden()
  let body: Partial<DbRow>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 })
  }
  // The actor is the caller, never the task's assignee (assigning Geno while
  // creating a task must not make the write — or its activity — Geno's).
  const agentType = assertedAgent || "user"
  // Status: one of the room's statuses (legacy Todo/Doing/Done map onto
  // their group); none given → the room's first to-do status.
  const statuses = await getStatusDefs(id)
  const status = body.status === undefined || body.status === null || body.status === ""
    ? defaultStatus(statuses)
    : resolveStatus(statuses, body.status)
  if (!status) {
    return NextResponse.json({ error: "invalid status", statuses: statuses.map((s) => s.name) }, { status: 400 })
  }

  try {
    const allowPg = cred.kind === "service" ? true : await authorizeDocFallback(cred, id)
    const doc = await loadDbDoc(id, cred, agentType, allowPg)
    const rows = rowsFromDbDoc(doc)
    // Fetched once, reused below — both were previously awaited twice each
    // in this same handler (getWipLimits, getFieldDefs), each its own
    // round trip to the same doc's props for the same request.
    const wipLimits = await getWipLimits(id)
    const fieldDefs = await getFieldDefs(id)
    // WIP gate (F2-4): creating into a full column is rejected, not queued.
    const limited = wipExceeded(rows, status, wipLimits)
    if (limited !== null) {
      return NextResponse.json({ error: "wip-exceeded", limit: limited }, { status: 409 })
    }
    const badCell = personCellsProblem(body.cells, fieldDefs)
    if (badCell) return NextResponse.json({ error: "invalid cells", field: badCell.fieldId, reason: badCell.reason }, { status: 400 })
    const input = cleanRowInput(body, status)
    const newId = newDbRowId()
    // Sub-task / dependencies: same-doc rows only, validated before writing.
    const parentId = cleanParentId(body.parentId)
    const parentErr = parentProblem(rows, newId, parentId)
    if (parentErr) return NextResponse.json({ error: "invalid parentId", reason: parentErr }, { status: 400 })
    if (Array.isArray(body.blockedBy) && body.blockedBy.length > MAX_BLOCKED_BY) {
      return NextResponse.json({ error: "invalid blockedBy", reason: "too_many" }, { status: 400 })
    }
    const blockedBy = cleanBlockedBy(body.blockedBy)
    const blockedErr = blockedByProblem(rows, newId, blockedBy)
    if (blockedErr) return NextResponse.json({ error: "invalid blockedBy", reason: blockedErr }, { status: 400 })
    const creator = actorRef(cred, agentType)
    // A person creating a task owns it unless they named another owner.
    const owner = input.owner ?? (creator?.kind === "user" ? creator : null)
    const newRow: DbRow = {
      id: newId,
      ...input,
      parentId,
      blockedBy,
      owner,
      createdBy: creator,
      createdAt: new Date().toISOString(),
      // Creator, owner and assignees follow the task from the start.
      followers: addFollowers([], [creator, owner, ...input.assignees]),
      comments: [],
      cells: cleanCells(body.cells, fieldDefs),
    }
    doc.transact(() => doc.getArray<Y.Map<unknown>>("database").push([dbRowToYMap(newRow)]), agentType)
    const actorName = cred.kind === "service" ? agentType.replace(/_/g, " ") : (cred.user.email ?? cred.user.user_id)
    const automated = await runStatusAutomations({
      doc,
      rowId: newRow.id,
      prevStatus: null,
      wipLimits,
      actorName,
      origin: agentType,
      getRules: () => getAutomationRules(id),
    })
    await saveDbDoc(id, doc, cred, agentType)
    await recordWorkspaceActivity({
      docId: id,
      credential: cred,
      agentType,
      action: 'database.row_created',
      summary: `Created task “${newRow.title}”`,
      targetType: 'database-row',
      targetId: newRow.id,
      metadata: { status: newRow.status, priority: newRow.priority, assignee: newRow.assignee, start: newRow.start, due: newRow.due },
    })
    if (automated.length > 0) {
      await recordWorkspaceActivity({
        docId: id,
        credential: cred,
        agentType,
        action: 'database.automation',
        summary: `Automation ran on task ${newRow.id}: ${automated.map((a) => a.ruleName).join(", ")}`,
        targetType: 'database-row',
        targetId: newRow.id,
        metadata: { applied: automated },
      })
    }
    await recordAssignments({ docId: id, rowId: newRow.id, credential: cred, agentType, added: newRow.assignees, title: newRow.title })
    const [resolved] = await withResolvedRollups([newRow], fieldDefs, cred, agentType, allowPg)
    // Semantic index (best-effort, never blocks the response).
    void indexRow(id, newRow.id, await workspaceOf(id), rowText(newRow)).catch(() => {})
    return NextResponse.json({ id: newRow.id, row: resolved ?? newRow, agentType }, { status: 201 })
  } catch (e) {
    if (e instanceof WorkspaceDenied) return NextResponse.json({ error: "forbidden" }, { status: e.status })
    console.error("[workspace/database POST]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}
