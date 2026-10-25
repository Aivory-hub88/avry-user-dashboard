-- Agent-to-agent communication in Team Space (ADR-021).
-- Applied: docker exec -i avry-postgres psql -U aivory -d aivory < migrations/workspace-agent-comms.sql
-- Requires migrations/workspace-agent-handoff.sql (chain_root / chain_depth).
--
-- kind       what the turn is: a human or plain @Name mention, an ask, the answer routed back to the
--            asker, a delegated task, its report back, a handoff, or a fired reminder.
-- from_agent the agent that asked / delegated / reminded (NULL = a human).
-- reply_to   the task id waiting on this one: an ask's asker, a delegation's delegator.
-- due_at     delegations only.

ALTER TABLE dashboard.workspace_agent_tasks
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'mention',
  ADD COLUMN IF NOT EXISTS from_agent TEXT,
  ADD COLUMN IF NOT EXISTS reply_to TEXT,
  ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS dashboard.workspace_agent_reminders (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL,
  thread_root TEXT NOT NULL REFERENCES dashboard.workspace_threads(id) ON DELETE CASCADE,
  target_agent TEXT NOT NULL,
  from_agent TEXT NOT NULL,
  text TEXT NOT NULL,
  fire_at TIMESTAMPTZ NOT NULL,
  fired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_agent_reminders_due
  ON dashboard.workspace_agent_reminders(space_id, fire_at) WHERE fired_at IS NULL;
