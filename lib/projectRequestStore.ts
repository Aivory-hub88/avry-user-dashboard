/**
 * Project requests — SERVER-ONLY store, access and approval (ADR-019 P1).
 *
 * Who sees what:
 * - requester: their own requests, edits while draft / changes_requested
 * - team owner (and platform admin): every request of the team, reviews
 *   submitted ones
 * - other team members: nothing until it becomes a room
 */
import * as Y from "yjs"
import { NextResponse } from "next/server"
import { query, withTransaction } from "@/lib/db"
import type { WorkspaceCredential } from "@/lib/workspaceAuth"
import { teamRole } from "@/lib/teams"
import { requestFromRow, EDITABLE, type ProjectRequest } from "@/lib/projectRequests"
import type { ScopeResolver } from "@/lib/workspaceFileHandlers"
import { newId } from "@/lib/spaceWrite"
import { dbRowToYMap, newDbRowId, saveDbDoc, type DbRow } from "@/lib/workspaceDb"
import type { FieldDef } from "@/lib/workspaceDbModel"
import { recordWorkspaceActivity } from "@/lib/workspaceActivity"
import { ingestRoomFiles } from "@/lib/roomContext"

export interface RequestAccess {
  isRequester: boolean
  isReviewer: boolean
}

export async function loadRequest(id: string): Promise<ProjectRequest | null> {
  const r = await query(`SELECT * FROM dashboard.project_requests WHERE id = $1`, [id])
  return r.rows[0] ? requestFromRow(r.rows[0] as Record<string, unknown>) : null
}

/** null = the caller may not see this request at all. */
export async function requestAccess(cred: WorkspaceCredential, r: ProjectRequest): Promise<RequestAccess | null> {
  const isRequester = cred.kind === "user" && cred.user.user_id === r.requestedBy
  const isReviewer = (await teamRole(cred, r.workspaceId)) === "owner"
  if (!isRequester && !isReviewer) return null
  return { isRequester, isReviewer }
}

/** Room database fields from the request's table: column 1 = row title, the rest = text fields. */
export function seedFields(columns: string[]): FieldDef[] {
  return columns.slice(1).map((name, i) => ({ id: `rq${i + 1}`, name: name.slice(0, 24).trim(), type: "text", options: [] }))
}

export function seedRows(table: ProjectRequest["dataTable"], fields: FieldDef[]): DbRow[] {
  return table.rows.map((cells) => ({
    id: newDbRowId(),
    title: cells[0] || "Untitled",
    status: "Todo",
    priority: "Med",
    assignee: "",
    start: "",
    due: "",
    description: "",
    comments: [],
    cells: Object.fromEntries(fields.map((f, i) => [f.id, cells[i + 1] ?? ""]).filter(([, v]) => v)),
  }))
}

export interface ApproveResult {
  roomId: string
  /** Emails that didn't match an account; they weren't added. */
  notFound: string[]
  /** Rows seeded into the room database (0 when the table was empty or seeding failed). */
  seededRows: number
  seedError: boolean
}

/**
 * Approve: claim the request (submitted → approved) and create its room in
 * one transaction, so two owners clicking at once can't make two rooms.
 * The room is owned by the requester; the team gets access through
 * workspace membership, extra people through per-doc ACL, agents through
 * workspace_agent_acl. The data table is seeded afterwards, best effort.
 */
export async function approveRequest(
  r: ProjectRequest,
  cred: WorkspaceCredential,
  reviewerId: string,
  note: string,
): Promise<ApproveResult | null> {
  const roomId = newId()
  const fields = seedFields(r.dataTable.columns)
  const props = {
    isProject: true,
    projectDocs: [],
    isRoom: true,
    requestId: r.id,
    brief: { goal: r.goal, deadline: r.deadline, priority: r.priority, fields: r.fields },
    ...(fields.length > 0 ? { dbFields: fields } : {}),
  }

  const done = await withTransaction(async (tx) => {
    const claimed = await tx(
      `UPDATE dashboard.project_requests
       SET status = 'approved', reviewer = $2, review_note = $3, reviewed_at = now(), room_id = $4, updated_at = now()
       WHERE id = $1 AND status = 'submitted' RETURNING id`,
      [r.id, reviewerId, note || null, roomId],
    )
    if ((claimed.rowCount ?? 0) === 0) return null

    for (const id of [roomId, `workspace:${roomId}`]) {
      await tx(
        `INSERT INTO dashboard.workspace_docs (id, workspace_id, owner, title, yjs_update, props, updated_at)
         VALUES ($1, $2, $3, $4, ''::bytea, $5::jsonb, now())`,
        [id, r.workspaceId, r.requestedBy, r.title, JSON.stringify(props)],
      )
    }
    await tx(
      `UPDATE dashboard.workspace_files SET room_id = $2, updated_at = now()
       WHERE request_id = $1 AND deleted_at IS NULL`,
      [r.id, roomId],
    )

    const notFound: string[] = []
    if (r.members.length > 0) {
      const users = await tx(
        `SELECT id, lower(email) AS email FROM identity.users WHERE lower(email) = ANY($1) AND deleted_at IS NULL`,
        [r.members.map((m) => m.email)],
      )
      const byEmail = new Map(users.rows.map((u) => [String(u.email), String(u.id)]))
      for (const m of r.members) {
        const userId = byEmail.get(m.email)
        if (!userId) {
          notFound.push(m.email)
          continue
        }
        if (userId === r.requestedBy) continue
        await tx(
          `INSERT INTO dashboard.workspace_doc_acl (doc_id, user_id, role, granted_by)
           VALUES ($1, $2, $3, $4) ON CONFLICT (doc_id, user_id) DO NOTHING`,
          [roomId, userId, m.role, reviewerId],
        )
      }
    }
    for (const agent of r.agents) {
      await tx(
        `INSERT INTO dashboard.workspace_agent_acl (doc_id, agent_type, role, granted_by)
         VALUES ($1, $2, 'editor', $3) ON CONFLICT (doc_id, agent_type) DO NOTHING`,
        [roomId, agent, reviewerId],
      )
    }
    return { notFound }
  })
  if (!done) return null

  let seededRows = 0
  let seedError = false
  const rows = seedRows(r.dataTable, fields)
  if (rows.length > 0) {
    try {
      const doc = new Y.Doc()
      doc.getArray<Y.Map<unknown>>("database").push(rows.map(dbRowToYMap))
      const service: WorkspaceCredential = { kind: "service", token: process.env.COLLAB_SERVICE_TOKEN ?? "" }
      await saveDbDoc(roomId, doc, service, "system")
      seededRows = rows.length
    } catch (e) {
      seedError = true
      console.error("[project-requests approve seed]", r.id, e)
    }
  }

  await recordWorkspaceActivity({
    docId: roomId,
    credential: cred,
    action: "room.opened",
    targetType: "project-request",
    targetId: r.id,
    summary: `Project request “${r.title}” approved`,
    metadata: { requestId: r.id, seededRows },
  }).catch(() => {})

  // The request's files now belong to the room: read them for its agents.
  void ingestRoomFiles(roomId)

  return { roomId, notFound: done.notFound, seededRows, seedError }
}

/**
 * File scope for a request's attachments: the requester uploads while it's
 * editable; team owners read. After approval the files belong to the room
 * (room_id set) and are managed there.
 */
export const requestScope: ScopeResolver = async (_req, cred, rid) => {
  const r = await loadRequest(rid)
  const access = r ? await requestAccess(cred, r) : null
  if (!r || !access) return NextResponse.json({ error: "request not found" }, { status: 404 })
  const editable = access.isRequester && EDITABLE.has(r.status)
  return {
    kind: "request",
    ownerId: rid,
    workspaceId: r.workspaceId,
    canWrite: editable,
    canManage: editable,
    activityDocId: null,
  }
}
