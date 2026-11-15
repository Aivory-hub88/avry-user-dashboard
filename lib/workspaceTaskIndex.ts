import { query } from "@/lib/db"
import { personKey } from "@/lib/workspaceDbModel"
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
  priority: string
  due: string | null
  owner_key: string | null
  creator_key: string | null
  assignee_keys: string[]
  follower_keys: string[]
}

/** Index lines for a doc's rows (pure; rows without an id are skipped). */
export function taskIndexRecords(rows: DbRow[]): TaskIndexRecord[] {
  const seen = new Set<string>()
  const out: TaskIndexRecord[] = []
  for (const r of rows) {
    if (!r.id || seen.has(r.id)) continue
    seen.add(r.id)
    out.push({
      row_id: r.id.slice(0, 64),
      title: r.title.slice(0, 200),
      status: (r.status || "Todo").slice(0, 16),
      priority: r.priority,
      due: /^\d{4}-\d{2}-\d{2}$/.test(r.due) ? r.due : null,
      owner_key: r.owner ? personKey(r.owner) : null,
      creator_key: r.createdBy ? personKey(r.createdBy) : null,
      assignee_keys: r.assignees.map(personKey),
      follower_keys: r.followers.map(personKey),
    })
  }
  return out
}

/** Replace a doc's index lines with `rows` (one statement: delete gone rows, upsert the rest). */
export async function syncTaskIndex(docId: string, rows: DbRow[], workspaceId?: string): Promise<void> {
  const id = bareDocId(docId)
  if (!id) return
  const records = taskIndexRecords(rows)
  try {
    await query(
      `WITH data AS (
         SELECT * FROM jsonb_to_recordset($3::jsonb) AS x(
           row_id text, title text, status text, priority text, due text,
           owner_key text, creator_key text, assignee_keys text[], follower_keys text[])
       ),
       gone AS (
         DELETE FROM dashboard.workspace_task_index g
         WHERE g.doc_id = $1 AND NOT EXISTS (SELECT 1 FROM data d WHERE d.row_id = g.row_id)
       )
       INSERT INTO dashboard.workspace_task_index AS t
         (doc_id, row_id, workspace_id, title, status, priority, due, owner_key, creator_key, assignee_keys, follower_keys, updated_at)
       SELECT $1, d.row_id, COALESCE($2, (SELECT workspace_id FROM dashboard.workspace_docs WHERE id IN ($1, 'workspace:' || $1) LIMIT 1), 'default'),
              d.title, d.status, d.priority, d.due::date, d.owner_key, d.creator_key,
              COALESCE(d.assignee_keys, '{}'), COALESCE(d.follower_keys, '{}'), now()
       FROM data d
       ON CONFLICT (doc_id, row_id) DO UPDATE SET
         title = EXCLUDED.title, status = EXCLUDED.status, priority = EXCLUDED.priority, due = EXCLUDED.due,
         owner_key = EXCLUDED.owner_key, creator_key = EXCLUDED.creator_key,
         assignee_keys = EXCLUDED.assignee_keys, follower_keys = EXCLUDED.follower_keys, updated_at = now()
       WHERE (t.title, t.status, t.priority, t.due, t.owner_key, t.creator_key, t.assignee_keys, t.follower_keys)
         IS DISTINCT FROM (EXCLUDED.title, EXCLUDED.status, EXCLUDED.priority, EXCLUDED.due,
                           EXCLUDED.owner_key, EXCLUDED.creator_key, EXCLUDED.assignee_keys, EXCLUDED.follower_keys)`,
      [id, workspaceId ?? null, JSON.stringify(records)],
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
    `SELECT t.doc_id, t.row_id, t.title, t.status, t.priority, to_char(t.due, 'YYYY-MM-DD') AS due,
            t.owner_key, t.creator_key, t.assignee_keys, t.follower_keys,
            (SELECT d.title FROM dashboard.workspace_docs d
              WHERE d.id IN (t.doc_id, 'workspace:' || t.doc_id) AND d.title IS NOT NULL LIMIT 1) AS room_title
     FROM dashboard.workspace_task_index t
     WHERE t.status <> 'Done'
       AND (t.owner_key = $1 OR t.creator_key = $1 OR $1 = ANY(t.assignee_keys) OR $1 = ANY(t.follower_keys))
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
    if (assignees.includes(key)) roles.push("assignee")
    if (row.owner_key === key) roles.push("owner")
    if (followers.includes(key)) roles.push("follower")
    if (row.creator_key === key) roles.push("creator")
    return {
      docId: row.doc_id as string,
      rowId: row.row_id as string,
      roomTitle: ((row.room_title as string | null) ?? "").trim() || "Untitled room",
      title: ((row.title as string) || "").trim() || "Untitled",
      status: row.status as string,
      priority: row.priority as string,
      due: (row.due as string | null) ?? "",
      roles,
    }
  })
}
