-- "Set you as Reviewer on <task>" notices (person custom fields).
-- Apply: docker exec -i avry-postgres psql -U aivory -d aivory < migrations/workspace-mentions-field-assigned.sql
-- Needs workspace-mentions-unblocked.sql first (it set the list this widens).
--
-- When someone is newly set on a person field of a task, they get an inbox row
-- with source 'field_assigned' (excerpt = "<field name>\n<task title>"). Until
-- this runs those inserts fail the CHECK and are logged, never failing the
-- user's edit. Safe to run before and after the deploy (idempotent).

ALTER TABLE dashboard.workspace_mentions DROP CONSTRAINT IF EXISTS workspace_mentions_source_check;
ALTER TABLE dashboard.workspace_mentions
  ADD CONSTRAINT workspace_mentions_source_check CHECK (
    source IN ('comment', 'description', 'assigned', 'commented', 'status_done', 'due_changed', 'due_soon', 'overdue', 'unblocked', 'field_assigned')
  );
