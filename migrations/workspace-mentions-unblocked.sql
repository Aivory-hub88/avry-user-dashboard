-- "Your task is unblocked" notices (Tasks P2: dependencies).
-- Apply: docker exec -i avry-postgres psql -U aivory -d aivory < migrations/workspace-mentions-unblocked.sql
-- Needs workspace-mentions-task-notices.sql first (it set the list this widens).
--
-- When the last open blocker of a task moves to Done, the task's assignees
-- and owner get an inbox row with source 'unblocked'. Until this runs those
-- inserts fail the CHECK and are logged, never failing the user's edit.

ALTER TABLE dashboard.workspace_mentions DROP CONSTRAINT IF EXISTS workspace_mentions_source_check;
ALTER TABLE dashboard.workspace_mentions
  ADD CONSTRAINT workspace_mentions_source_check CHECK (
    source IN ('comment', 'description', 'assigned', 'commented', 'status_done', 'due_changed', 'due_soon', 'overdue', 'unblocked')
  );
