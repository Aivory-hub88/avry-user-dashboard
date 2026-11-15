-- Custom statuses with groups (Tasks P2 item 13).
-- Apply BEFORE deploying: docker exec -i avry-postgres psql -U aivory -d aivory < migrations/workspace-task-status-groups.sql
-- Re-run once AFTER the deploy too: lines the old code upserted in between got the
-- default group; the backfill below only touches lines still on the default and is
-- idempotent.
--
-- Rooms name their own statuses (props.dbStatuses), each in a fixed group
-- (todo | in_progress | done | canceled). "My tasks" and due reminders read
-- the group, not the name, so a room's "Shipped" or "Won't do" counts as
-- closed. The app writes the group on every sync and re-stamps a room's lines
-- when its statuses change.

ALTER TABLE dashboard.workspace_task_index
  ADD COLUMN IF NOT EXISTS status_group TEXT NOT NULL DEFAULT 'todo';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspace_task_index_status_group_check'
  ) THEN
    ALTER TABLE dashboard.workspace_task_index
      ADD CONSTRAINT workspace_task_index_status_group_check
      CHECK (status_group IN ('todo', 'in_progress', 'done', 'canceled'));
  END IF;
END $$;

-- Rooms without custom statuses: the legacy names.
UPDATE dashboard.workspace_task_index t
   SET status_group = CASE t.status WHEN 'Done' THEN 'done' WHEN 'Doing' THEN 'in_progress' ELSE 'todo' END
 WHERE t.status_group = 'todo'
   AND t.status IN ('Done', 'Doing')
   AND NOT EXISTS (
     SELECT 1 FROM dashboard.workspace_docs d
      WHERE d.id IN (t.doc_id, 'workspace:' || t.doc_id) AND d.props ? 'dbStatuses');

-- Due reminders scan open tasks by date.
DROP INDEX IF EXISTS dashboard.idx_task_index_due;
CREATE INDEX IF NOT EXISTS idx_task_index_due_open ON dashboard.workspace_task_index(due)
  WHERE due IS NOT NULL AND status_group NOT IN ('done', 'canceled');
