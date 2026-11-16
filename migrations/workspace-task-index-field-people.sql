-- Person custom fields in "My tasks": the task index remembers who is set on
-- each person field of a row, as { "<field name>": ["user:<id>", ...] }.
-- Apply: docker exec -i avry-postgres psql -U aivory -d aivory -v ON_ERROR_STOP=1 < migrations/workspace-task-index-field-people.sql
-- Then re-fill existing rooms once (service token, from inside the container):
--   docker exec avry-user-dashboard node -e "fetch('http://localhost:3000/dashboard/api/workspace/tasks/index/backfill',{method:'POST',headers:{'x-service-token':process.env.COLLAB_SERVICE_TOKEN}}).then(r=>r.json()).then(console.log)"
-- Until the column exists, index syncs fail (logged) — apply BEFORE deploying.
ALTER TABLE dashboard.workspace_task_index
  ADD COLUMN IF NOT EXISTS field_people JSONB NOT NULL DEFAULT '{}'::jsonb;
