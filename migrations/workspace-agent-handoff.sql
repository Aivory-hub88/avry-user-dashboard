-- Agent-to-agent handoff in Team Space (ADR-020).
-- Applied: docker exec -i avry-postgres psql -U aivory -d aivory < migrations/workspace-agent-handoff.sql
--
-- A reply that @mentions a teammate enqueues a task for them (created_by 'agent:<type>').
-- chain_root = the human message that started the chain; chain_depth = hops after it
-- (human -> A is 0, A -> B is 1). Both are only written for handoff tasks; human-created
-- tasks keep NULL/0 and count as their own chain via trigger_msg, so this migration
-- can run before or after the dashboard deploy (the handoff path catches a missing column).

ALTER TABLE dashboard.workspace_agent_tasks
  ADD COLUMN IF NOT EXISTS chain_root TEXT,
  ADD COLUMN IF NOT EXISTS chain_depth INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_workspace_agent_tasks_chain
  ON dashboard.workspace_agent_tasks(chain_root) WHERE chain_root IS NOT NULL;
