-- Cross-room task index for "My tasks" (Tasks P1).
-- Apply: docker exec -i avry-postgres psql -U aivory -d aivory < migrations/workspace-task-index.sql
-- Then fill it once for existing rooms (service token, from inside the container):
--   docker exec avry-user-dashboard node -e "fetch('http://localhost:3000/dashboard/api/workspace/tasks/index/backfill',{method:'POST',headers:{'x-service-token':process.env.COLLAB_SERVICE_TOKEN}}).then(r=>r.json()).then(console.log)"
--
-- Task rows live inside Yjs docs, which SQL can't query. Every row write
-- (REST routes via saveDbDoc, the UI's /doc PUT) re-syncs that doc's rows
-- here: one line per task with who it involves as person keys
-- (`user:<id>` / `agent:<type>`). Readers still check access per room.
-- Until this runs, syncs fail and are logged; "My tasks" shows nothing.

CREATE TABLE IF NOT EXISTS dashboard.workspace_task_index (
  doc_id TEXT NOT NULL,
  row_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT 'default',
  title TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Todo',
  priority TEXT NOT NULL DEFAULT 'Med',
  due DATE,
  owner_key TEXT,
  creator_key TEXT,
  assignee_keys TEXT[] NOT NULL DEFAULT '{}',
  follower_keys TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (doc_id, row_id)
);

CREATE INDEX IF NOT EXISTS idx_task_index_owner ON dashboard.workspace_task_index(owner_key);
CREATE INDEX IF NOT EXISTS idx_task_index_creator ON dashboard.workspace_task_index(creator_key);
CREATE INDEX IF NOT EXISTS idx_task_index_assignees ON dashboard.workspace_task_index USING GIN (assignee_keys);
CREATE INDEX IF NOT EXISTS idx_task_index_followers ON dashboard.workspace_task_index USING GIN (follower_keys);
-- Due reminders scan open tasks by date.
CREATE INDEX IF NOT EXISTS idx_task_index_due ON dashboard.workspace_task_index(due) WHERE due IS NOT NULL AND status <> 'Done';
