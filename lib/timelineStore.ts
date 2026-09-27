/**
 * Project timeline data — SERVER-ONLY (ADR-019 P6).
 *
 * One read for the whole window: the rooms the caller reaches (or one room),
 * each room's dated tasks straight from its stored Y.Doc, the brief's
 * deadline, dated notes, and agent turns counted per day in the viewer's
 * time zone. The cross-room view also shows project requests still waiting
 * for approval that have a deadline.
 */
import * as Y from "yjs"
import { query } from "@/lib/db"
import { getDocRolesBatch, canWrite } from "@/lib/workspaceAccess"
import type { WorkspaceCredential } from "@/lib/workspaceAuth"
import { ROOMS_VISIBLE_TO_USER } from "@/lib/teams"
import { canonicalRoomId, legacyDocId, mergeYjsUpdates } from "@/lib/workspaceDoc"
import { rowsFromDbDoc } from "@/lib/workspaceDb"
import { agentDisplayName } from "@/lib/spaceAgent"
import { overlaps, taskItem, toDay, type Day, type TimelineGroup, type TimelineItem, type TimelinePayload } from "@/lib/timeline"

const MAX_ROOMS = 60
const MAX_REQUESTS = 100

/** An IANA zone both Node and Postgres understand, else UTC. */
export function cleanTimeZone(tz: unknown): string {
  if (typeof tz !== "string" || tz.length > 64 || !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)*$/.test(tz)) return "UTC"
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz })
    return tz
  } catch {
    return "UTC"
  }
}

interface RoomRow {
  id: string
  title: string | null
  team_name: string | null
  props: Record<string, unknown> | null
}

async function roomsFor(userId: string, roomId: string | null): Promise<RoomRow[]> {
  if (roomId) {
    const r = await query(
      `SELECT d.id, d.title, w.name AS team_name, d.props FROM dashboard.workspace_docs d
       LEFT JOIN dashboard.workspaces w ON w.id = d.workspace_id
       WHERE d.id IN ($1, $2) AND d.deleted_at IS NULL AND d.owner IS NOT NULL`,
      [roomId, `workspace:${roomId}`],
    )
    const rows = r.rows as RoomRow[]
    const row = rows.find((x) => x.id === `workspace:${roomId}`) ?? rows[0]
    return row ? [{ ...row, id: roomId }] : []
  }
  const r = await query(
    `SELECT d.id, d.title, w.name AS team_name, d.props FROM dashboard.workspace_docs d
     LEFT JOIN dashboard.workspaces w ON w.id = d.workspace_id
     WHERE ${ROOMS_VISIBLE_TO_USER}
     ORDER BY d.updated_at DESC LIMIT ${MAX_ROOMS}`,
    [userId],
  )
  return r.rows as RoomRow[]
}

/** Every room's task rows, one query for all stored Y.Docs. */
async function tasksByRoom(roomIds: string[]): Promise<Map<string, ReturnType<typeof rowsFromDbDoc>>> {
  const out = new Map<string, ReturnType<typeof rowsFromDbDoc>>()
  if (roomIds.length === 0) return out
  const ids = roomIds.flatMap((id) => [canonicalRoomId(id), legacyDocId(id)])
  const r = await query(`SELECT id, yjs_update FROM dashboard.workspace_docs WHERE id = ANY($1)`, [ids])
  const byId = new Map<string, Buffer>((r.rows as { id: string; yjs_update: Buffer }[]).map((row) => [row.id, row.yjs_update]))
  for (const id of roomIds) {
    try {
      const merged = mergeYjsUpdates([byId.get(canonicalRoomId(id)) ?? null, byId.get(legacyDocId(id)) ?? null])
      if (!merged) continue
      const doc = new Y.Doc()
      Y.applyUpdate(doc, new Uint8Array(merged))
      out.set(id, rowsFromDbDoc(doc))
    } catch (e) {
      console.error("[timeline tasks]", id, e)
    }
  }
  return out
}

export async function loadTimeline(opts: {
  cred: Extract<WorkspaceCredential, { kind: "user" }>
  roomId: string | null
  from: Day
  to: Day
  tz: string
}): Promise<TimelinePayload> {
  const { cred, roomId, from, to, tz } = opts
  const userId = cred.user.user_id
  const rooms = await roomsFor(userId, roomId)
  const ids = rooms.map((r) => r.id)
  const [roles, tasks, notes, jobs, requests] = await Promise.all([
    getDocRolesBatch(cred, ids),
    tasksByRoom(ids),
    ids.length === 0
      ? { rows: [] }
      : query(
          `SELECT id, room_id, title, body, on_date::text AS on_date, for_kind, for_id, for_name FROM dashboard.room_notes
           WHERE room_id = ANY($1) AND deleted_at IS NULL AND on_date BETWEEN $2::date AND $3::date
           ORDER BY on_date, created_at LIMIT 500`,
          [ids, from, to],
        ),
    ids.length === 0
      ? { rows: [] }
      : query(
          `SELECT space_id, agent_type, ((created_at AT TIME ZONE $4)::date)::text AS day,
                  count(*)::int AS n, (count(*) FILTER (WHERE status = 'failed'))::int AS failed
           FROM dashboard.workspace_agent_tasks
           WHERE space_id = ANY($1) AND created_at >= ($2::date - 1) AND created_at < ($3::date + 2)
           GROUP BY 1, 2, 3`,
          [ids, from, to, tz],
        ),
    roomId
      ? { rows: [] }
      : query(
          `SELECT r.id, r.title, r.status, r.deadline::text AS deadline,
                  ((COALESCE(r.submitted_at, r.created_at) AT TIME ZONE $4)::date)::text AS opened, w.name AS team_name
           FROM dashboard.project_requests r
           JOIN dashboard.workspaces w ON w.id = r.workspace_id
           WHERE r.deadline IS NOT NULL AND r.status IN ('draft', 'submitted', 'changes_requested')
             AND (r.requested_by = $1 OR (r.status = 'submitted' AND (
                   w.owner = $1 OR EXISTS (SELECT 1 FROM dashboard.workspace_members m
                                           WHERE m.workspace_id = r.workspace_id AND m.user_id = $1 AND m.role = 'owner'))))
             AND r.deadline >= $2::date AND COALESCE(r.submitted_at, r.created_at) < ($3::date + 1)
           ORDER BY r.deadline LIMIT ${MAX_REQUESTS}`,
          [userId, from, to, tz],
        ),
  ])

  const groups: TimelineGroup[] = rooms
    .filter((r) => roles.get(r.id) != null)
    .map((room) => {
      const editable = canWrite(roles.get(room.id) ?? null)
      const brief = (room.props?.brief ?? {}) as Record<string, unknown>
      const deadline = toDay(brief.deadline)
      const items: TimelineItem[] = []
      let unscheduled = 0
      for (const row of tasks.get(room.id) ?? []) {
        const item = taskItem(row, room.id, editable)
        if (!item) unscheduled++
        else if (overlaps(item, from, to)) items.push(item)
      }
      if (deadline && deadline >= from && deadline <= to)
        items.push({ id: `deadline:${room.id}`, kind: "deadline", roomId: room.id, title: "Project deadline", start: deadline, end: deadline })
      return {
        roomId: room.id,
        title: room.title || "Untitled room",
        teamName: room.team_name ?? "",
        deadline,
        canWrite: editable,
        unscheduled,
        items,
      }
    })
  const byRoom = new Map(groups.map((g) => [g.roomId, g]))

  for (const n of notes.rows as Record<string, unknown>[]) {
    const day = toDay(n.on_date)
    const g = byRoom.get(String(n.room_id))
    if (!day || !g) continue
    g.items.push({
      id: `note:${n.id}`,
      kind: "note",
      roomId: g.roomId,
      noteId: String(n.id),
      title: String(n.title ?? "").trim() || "Untitled note",
      body: String(n.body ?? "").slice(0, 600),
      start: day,
      end: day,
      forKind: n.for_kind === "member" || n.for_kind === "agent" ? n.for_kind : null,
      forId: typeof n.for_id === "string" ? n.for_id : null,
      forName: String(n.for_name ?? ""),
    })
  }

  for (const j of jobs.rows as Record<string, unknown>[]) {
    const day = toDay(j.day)
    const g = byRoom.get(String(j.space_id))
    if (!day || !g || day < from || day > to) continue
    const agent = String(j.agent_type)
    const n = Number(j.n ?? 0)
    g.items.push({
      id: `job:${g.roomId}:${agent}:${day}`,
      kind: "job",
      roomId: g.roomId,
      agentType: agent,
      title: `${agentDisplayName(agent)}: ${n} ${n === 1 ? "turn" : "turns"}`,
      start: day,
      end: day,
      count: n,
      failed: Number(j.failed ?? 0),
    })
  }

  const pending: TimelineItem[] = []
  for (const r of requests.rows as Record<string, unknown>[]) {
    const deadline = toDay(r.deadline)
    if (!deadline) continue
    let opened = toDay(r.opened) ?? deadline
    if (opened > deadline) opened = deadline
    pending.push({
      id: `request:${r.id}`,
      kind: "request",
      roomId: null,
      requestId: String(r.id),
      requestStatus: String(r.status),
      teamName: String(r.team_name ?? ""),
      title: String(r.title ?? "Untitled request"),
      start: opened,
      end: deadline,
    })
  }

  return { from, to, groups, requests: pending }
}
