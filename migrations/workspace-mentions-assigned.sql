-- Task assignment notifications (Tasks P0 "assign to").
-- Applied: docker exec -i avry-postgres psql -U aivory -d aivory < migrations/workspace-mentions-assigned.sql
--
-- Assigning a person or agent to a task drops a row into the same inbox the
-- @mentions use (dashboard.workspace_mentions), with source = 'assigned' and
-- the task title as the excerpt. Readers already filter by mentioned_kind /
-- mentioned_id, so no new table or index is needed — only the CHECK widens.
-- Until this runs, assignment inserts fail the CHECK and are logged, never
-- failing the user's edit (the insert is fire-and-forget).

ALTER TABLE dashboard.workspace_mentions DROP CONSTRAINT IF EXISTS workspace_mentions_source_check;
ALTER TABLE dashboard.workspace_mentions
  ADD CONSTRAINT workspace_mentions_source_check CHECK (source IN ('comment', 'description', 'assigned'));
