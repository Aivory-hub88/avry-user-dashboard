import { query } from "@/lib/db"

/**
 * Due reminders (Tasks P1): open tasks due tomorrow → 'due_soon', past due
 * → 'overdue', as inbox rows (dashboard.workspace_mentions) for the task's
 * assignees and owner (people only). Reads the task index, so it needs no
 * room access of its own; the inbox still checks access when it reads.
 *
 * Idempotent: dashboard.workspace_task_reminders records (task, person,
 * kind, day), so a pass that runs again — or in a second container — sends
 * nothing new. Runs in-process from instrumentation.ts (no cron needed).
 */

export const REMINDER_SEND_HOUR = 8
const PASS_EVERY_MS = 30 * 60_000
const FIRST_PASS_MS = 60_000

/** Calendar day and hour of `now` in `timeZone` (YYYY-MM-DD, 0–23). */
export function localDayAndHour(now: Date, timeZone: string): { day: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ""
  return { day: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) }
}

export function nextDayISO(day: string): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

export function reminderTimeZone(): string {
  const tz = process.env.TASK_REMINDER_TZ || "Asia/Jakarta"
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz })
    return tz
  } catch {
    return "Asia/Jakarta"
  }
}

export type ReminderPass = { skipped: "too-early" } | { day: string; sent: number }

/**
 * One reminder pass. Before REMINDER_SEND_HOUR local time it does nothing
 * (nobody wants a 00:30 ping); after that it sends whatever today's pass
 * hasn't sent yet. `force` ignores the hour (manual trigger).
 */
export async function runDueReminders(now: Date = new Date(), opts: { force?: boolean } = {}): Promise<ReminderPass> {
  const { day, hour } = localDayAndHour(now, reminderTimeZone())
  if (!opts.force && hour < REMINDER_SEND_HOUR) return { skipped: "too-early" }
  const tomorrow = nextDayISO(day)
  const r = await query(
    `WITH due AS (
       SELECT t.doc_id, t.row_id, t.workspace_id, t.title,
              CASE WHEN t.due = $2::date THEN 'due_soon' ELSE 'overdue' END AS kind,
              array_append(t.assignee_keys, t.owner_key) AS keys
       FROM dashboard.workspace_task_index t
       WHERE t.status_group NOT IN ('done', 'canceled') AND t.due IS NOT NULL AND (t.due = $2::date OR t.due < $1::date)
         AND NOT EXISTS (
           SELECT 1 FROM dashboard.workspace_docs d
           WHERE d.id IN (t.doc_id, 'workspace:' || t.doc_id) AND d.deleted_at IS NOT NULL)
     ),
     recips AS (
       SELECT DISTINCT d.doc_id, d.row_id, d.workspace_id, d.title, d.kind, k AS recipient
       FROM due d CROSS JOIN LATERAL unnest(d.keys) AS k
       WHERE k LIKE 'user:_%'
     ),
     fresh AS (
       INSERT INTO dashboard.workspace_task_reminders (doc_id, row_id, recipient, kind, day)
       SELECT doc_id, row_id, recipient, kind, $1::date FROM recips
       ON CONFLICT DO NOTHING
       RETURNING doc_id, row_id, recipient, kind
     )
     INSERT INTO dashboard.workspace_mentions
       (workspace_id, doc_id, row_id, actor_type, actor_id, actor_name, mentioned_kind, mentioned_id, source, excerpt)
     SELECT r.workspace_id, f.doc_id, f.row_id, 'system', NULL, 'Aivory', 'user', substr(f.recipient, 6), f.kind,
            left(COALESCE(NULLIF(btrim(r.title), ''), 'Untitled'), 200)
     FROM fresh f
     JOIN recips r ON r.doc_id = f.doc_id AND r.row_id = f.row_id AND r.recipient = f.recipient AND r.kind = f.kind
     RETURNING id`,
    [day, tomorrow],
  )
  // Keep the dedupe table small; a month covers any clock or zone change.
  await query(`DELETE FROM dashboard.workspace_task_reminders WHERE day < $1::date - 30`, [day]).catch(() => {})
  return { day, sent: r.rows.length }
}

let started = false

/** Start the in-process loop (first pass after a minute, then every 30 minutes). */
export function startTaskReminderLoop(): void {
  if (started) return
  started = true
  const pass = () => {
    runDueReminders()
      .then((res) => {
        if ("sent" in res && res.sent > 0) console.log(`[task reminders] ${res.day}: sent ${res.sent}`)
      })
      .catch((e) => console.error("[task reminders]", e instanceof Error ? e.message : e))
  }
  setTimeout(pass, FIRST_PASS_MS).unref?.()
  setInterval(pass, PASS_EVERY_MS).unref?.()
}
