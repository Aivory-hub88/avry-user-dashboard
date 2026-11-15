-- Due reminders for tasks (Tasks P1).
-- Apply AFTER workspace-task-index.sql and workspace-mentions-task-notices.sql:
--   docker exec -i avry-postgres psql -U aivory -d aivory < migrations/workspace-task-reminders.sql
--
-- The dashboard runs a reminder pass every 30 minutes (instrumentation.ts →
-- lib/taskReminders.ts). From 08:00 local time (TASK_REMINDER_TZ, default
-- Asia/Jakarta) each open task due tomorrow gives its assignees + owner a
-- 'due_soon' inbox row, and each overdue task an 'overdue' row. This table
-- makes that once per task, person, kind and day, however often the pass
-- runs or however many dashboard containers run it. Rows older than 30 days
-- are pruned by the pass itself.

CREATE TABLE IF NOT EXISTS dashboard.workspace_task_reminders (
  doc_id TEXT NOT NULL,
  row_id TEXT NOT NULL,
  recipient TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('due_soon', 'overdue')),
  day DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (doc_id, row_id, recipient, kind, day)
);

CREATE INDEX IF NOT EXISTS idx_task_reminders_day ON dashboard.workspace_task_reminders(day);
