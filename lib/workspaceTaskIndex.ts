import { query } from "@/lib/db"
import { cellPeople, parseFieldDefs, parseStatusDefs, personKey, statusGroup, type FieldDef, type StatusDef, type StatusGroup } from "@/lib/workspaceDbModel"
import type { DbRow } from "@/lib/workspaceDb"
import type { MyTask, MyTaskRole } from "@/lib/myTasks"

/**
 * Cross-room task index (dashboard.workspace_task_index) for "My tasks" and
 * due reminders. Task rows live in Yjs docs, so every write path re-syncs
 * the whole doc's rows here (upsert present rows, delete missing ones).
 * Best-effort: a failure is logged and never fails the write.
 */

/** Bare doc id as rooms use it in URLs (`workspace:`, `room:`, `db:` stripped). */
export function bareDocId(id: string): string {
  return id.replace(/^workspace:(room:|db:)?/, "").slice(0, 64)
}

export type TaskIndexRecord = {
  row_id: string
  title: string
  status: string
  status_group: StatusGroup
  priority: string
  due: string | null
  owner_key: string | null
  creator_key: string | null
  assignee_keys: string[]
  follower_keys: string[]
  /** Person custom fields: `{ "<field name>": [person keys] }` (empty fields left out). */
  field_people: Record<string, string[]>
}

/** People set on each person field of a row, keyed by the field's name. */
export function fieldPeopleOf(r: DbRow, fields: readonly FieldDef[]): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const f of fields) {
    if (f.type !== "person") continue
    const keys = cellPeople(r.cells?.[f.id]).map(personKey)
    if (keys.length > 0) out[f.name] = [...new Set([...(out[f.name] ?? []), ...keys])]
  }
  return out
}

/** Index lines for a doc's rows (pure; rows without an id are skipped). */
export function taskIndexRecords(rows: DbRow[], statuses: readonly StatusDef[] = parseStatusDefs(undefined), fields: readonly FieldDef[] = []): TaskIndexRecord[] {
  const seen = new Set<string>()
  const out: TaskIndexRecord[] = []
  for (const r of rows) {
    if (!r.id || seen.has(r.id)) continue
    seen.add(r.id)
    out.push({
      row_id: r.id.slice(0, 64),
      title: r.title.slice(0, 200),
      status: (r.status || "Todo").slice(0, 16),
      status_group: statusGroup(statuses, r.status || "Todo"),
      priority: r.priority,
      due: /^\d{4}-\d{2}-\d{2}$/.test(r.due) ? r.due : null,
      owner_key: r.owner ? personKey(r.owner) : null,
      creator_key: r.createdBy ? personKey(r.createdBy) : null,
      assignee_keys: r.assignees.map(personKey),
      follower_keys: r.followers.map(personKey),
      field_people: fieldPeopleOf(r, fields),
    })
  }
  return out
}

/** Replace a doc's index lines with `rows` (one statement: delete gone rows, upsert the rest). */
export async function syncTaskIndex(docId: string, rows: DbRow[], workspaceId?: string): Promise<void> {
  const id = bareDocId(docId)
  if (!id) return
  try {
    const room = await roomDefs(id)
    const records = taskIndexRecords(rows, room.statuses, room.fields)
    await query(
      `WITH data AS (
         SELECT * FROM jsonb_to_recordset($3::jsonb) AS x(
           row_id text, title text, status text, status_group text, priority text, due text,
           owner_key text, creator_key text, assignee_keys text[], follower_keys text[], field_people jsonb)
       ),
       gone AS (
         DELETE FROM dashboard.workspace_task_index g
         WHERE g.doc_id = $1 AND NOT EXISTS (SELECT 1 FROM data d WHERE d.row_id = g.row_id)
       )
       INSERT INTO dashboard.workspace_task_index AS t
         (doc_id, row_id, workspace_id, title, status, status_group, priority, due, owner_key, creator_key, assignee_keys, follower_keys, field_people, updated_at)
       SELECT $1, d.row_id, COALESCE($2, (SELECT workspace_id FROM dashboard.workspace_docs WHERE id IN ($1, 'workspace:' || $1) LIMIT 1), 'default'),
              d.title, d.status, d.status_group, d.priority, d.due::date, d.owner_key, d.creator_key,
              COALESCE(d.assignee_keys, '{}'), COALESCE(d.follower_keys, '{}'), COALESCE(d.field_people, '{}'::jsonb), now()
       FROM data d
       ON CONFLICT (doc_id, row_id) DO UPDATE SET
         title = EXCLUDED.title, status = EXCLUDED.status, status_group = EXCLUDED.status_group, priority = EXCLUDED.priority, due = EXCLUDED.due,
         owner_key = EXCLUDED.owner_key, creator_key = EXCLUDED.creator_key,
         assignee_keys = EXCLUDED.assignee_keys, follower_keys = EXCLUDED.follower_keys,
         field_people = EXCLUDED.field_people, updated_at = now()
       WHERE (t.title, t.status, t.status_group, t.priority, t.due, t.owner_key, t.creator_key, t.assignee_keys, t.follower_keys, t.field_people)
         IS DISTINCT FROM (EXCLUDED.title, EXCLUDED.status, EXCLUDED.status_group, EXCLUDED.priority, EXCLUDED.due,
                           EXCLUDED.owner_key, EXCLUDED.creator_key, EXCLUDED.assignee_keys, EXCLUDED.follower_keys, EXCLUDED.field_people)`,
      [id, workspaceId ?? null, JSON.stringify(records)],
    )
  } catch (e) {
    console.error("[workspace task index]", e)
  }
}

/** The room's statuses (default Todo/Doing/Done) and custom fields, read from its props. */
async function roomDefs(id: string): Promise<{ statuses: StatusDef[]; fields: FieldDef[] }> {
  const r = await query(`SELECT props FROM dashboard.workspace_docs WHERE id IN ($1, 'workspace:' || $1) LIMIT 1`, [id])
  const props = r.rows[0]?.props as Record<string, unknown> | undefined
  return { statuses: parseStatusDefs(props?.dbStatuses), fields: parseFieldDefs(props?.dbFields) }
}

/**
 * Re-derive every index line's group after the room's statuses changed (a
 * status moved to another group, or was renamed while rows still carry the
 * old name). Names the room no longer lists keep their legacy meaning.
 */
export async function restampTaskIndexGroups(docId: string, statuses: readonly StatusDef[]): Promise<void> {
  try {
    await query(
      `WITH s AS (SELECT * FROM jsonb_to_recordset($2::jsonb) AS x(name text, "group" text))
       UPDATE dashboard.workspace_task_index t
          SET status_group = g.grp, updated_at = now()
         FROM (
           SELECT i.row_id, COALESCE((SELECT s."group" FROM s WHERE s.name = i.status),
                    CASE i.status WHEN 'Done' THEN 'done' WHEN 'Doing' THEN 'in_progress' ELSE 'todo' END) AS grp
             FROM dashboard.workspace_task_index i WHERE i.doc_id = $1
         ) g
        WHERE t.doc_id = $1 AND t.row_id = g.row_id AND t.status_group IS DISTINCT FROM g.grp`,
      [bareDocId(docId), JSON.stringify(statuses)],
    )
  } catch (e) {
    console.error("[workspace task index]", e)
  }
}

/** Drop every index line of a doc (room deleted). */
export async function clearTaskIndex(docId: string): Promise<void> {
  try {
    await query(`DELETE FROM dashboard.workspace_task_index WHERE doc_id = $1`, [bareDocId(docId)])
  } catch (e) {
    console.error("[workspace task index]", e)
  }
}

const MAX_MY_TASKS = 500

/**
 * Open tasks that involve `key` (assignee, owner, follower or creator), with
 * the room title. Access is NOT checked here — callers filter per room.
 */
export async function tasksInvolving(key: string): Promise<MyTask[]> {
  const r = await query(
    `SELECT t.doc_id, t.row_id, t.title, t.status, t.status_group, t.priority, to_char(t.due, 'YYYY-MM-DD') AS due,
            t.owner_key, t.creator_key, t.assignee_keys, t.follower_keys, t.field_people,
            (SELECT d.title FROM dashboard.workspace_docs d
              WHERE d.id IN (t.doc_id, 'workspace:' || t.doc_id) AND d.title IS NOT NULL LIMIT 1) AS room_title
     FROM dashboard.workspace_task_index t
     WHERE t.status_group NOT IN ('done', 'canceled')
       AND (t.owner_key = $1 OR t.creator_key = $1 OR $1 = ANY(t.assignee_keys) OR $1 = ANY(t.follower_keys)
         OR EXISTS (SELECT 1 FROM jsonb_each(t.field_people) fp WHERE fp.value ? $1))
       AND NOT EXISTS (
         SELECT 1 FROM dashboard.workspace_docs d
         WHERE d.id IN (t.doc_id, 'workspace:' || t.doc_id) AND d.deleted_at IS NOT NULL)
     ORDER BY t.due NULLS LAST, t.title
     LIMIT ${MAX_MY_TASKS}`,
    [key],
  )
  return r.rows.map((row) => {
    const roles: MyTaskRole[] = []
    const assignees = (row.assignee_keys as string[] | null) ?? []
    const followers = (row.follower_keys as string[] | null) ?? []
    // Person-field names (Reviewer, ...) that hold me; they fold into "Assigned to me".
    const fields = Object.entries((row.field_people as Record<string, string[]> | null) ?? {})
      .filter(([, keys]) => Array.isArray(keys) && keys.includes(key))
      .map(([name]) => name)
    if (assignees.includes(key) || fields.length > 0) roles.push("assignee")
    if (row.owner_key === key) roles.push("owner")
    if (followers.includes(key)) roles.push("follower")
    if (row.creator_key === key) roles.push("creator")
    return {
      docId: row.doc_id as string,
      rowId: row.row_id as string,
      roomTitle: ((row.room_title as string | null) ?? "").trim() || "Untitled room",
      title: ((row.title as string) || "").trim() || "Untitled",
      status: row.status as string,
      statusGroup: row.status_group as StatusGroup,
      priority: row.priority as string,
      due: (row.due as string | null) ?? "",
      roles,
      ...(fields.length > 0 ? { fields } : {}),
    }
  })
}
