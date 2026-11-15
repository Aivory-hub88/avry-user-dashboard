-- Task follower + reminder notices (Tasks P1).
-- Apply: docker exec -i avry-postgres psql -U aivory -d aivory < migrations/workspace-mentions-task-notices.sql
--
-- Followers of a task get inbox rows in dashboard.workspace_mentions when
-- someone comments ('commented'), moves it to Done ('status_done') or
-- changes its due date ('due_changed'). The daily reminder job adds
-- 'due_soon' (due tomorrow) and 'overdue'. Readers already filter by
-- mentioned_kind / mentioned_id, so only the CHECK widens.
-- Until this runs, these inserts fail the CHECK and are logged, never
-- failing the user's edit (the inserts are fire-and-forget).

ALTER TABLE dashboard.workspace_mentions DROP CONSTRAINT IF EXISTS workspace_mentions_source_check;
ALTER TABLE dashboard.workspace_mentions
  ADD CONSTRAINT workspace_mentions_source_check CHECK (
    source IN ('comment', 'description', 'assigned', 'commented', 'status_done', 'due_changed', 'due_soon', 'overdue')
  );

-- Follower notices de-duplicate per (task, kind, text, person) over 10 minutes.
CREATE INDEX IF NOT EXISTS idx_workspace_mentions_row
  ON dashboard.workspace_mentions(doc_id, row_id, source, created_at DESC);
