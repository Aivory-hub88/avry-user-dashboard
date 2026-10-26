-- ADR-021 follow-up: answers between agents are queued, gathered and never lost.
-- Applied: docker exec -i avry-postgres psql -U aivory -d aivory < migrations/workspace-agent-comms-routing.sql
-- Requires migrations/workspace-agent-comms.sql. Additive only: older code ignores these columns.
--
-- queued        a team turn (ask / delegate / handoff / answer / report) for an agent that already had an
--               open turn in the thread. It stays `todo` and starts when that agent's open turn ends
--               (or on the room poll), instead of being dropped or reduced to a note.
-- routed_at     an ask / delegate whose outcome (answer, report or failure) was handed to the agent waiting
--               on it. Claimed atomically, so two teammates finishing at once give the asker one turn.
--               Cleared when the task runs again, so a re-run's new answer is routed too.
-- held_actions  team actions a turn made before it parked on an approval; the resumed turn carries them out
--               together with its own, so they are not lost.

ALTER TABLE dashboard.workspace_agent_tasks
  ADD COLUMN IF NOT EXISTS queued BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS routed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS held_actions JSONB;

CREATE INDEX IF NOT EXISTS idx_workspace_agent_tasks_reply_to
  ON dashboard.workspace_agent_tasks(reply_to) WHERE reply_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_workspace_agent_tasks_queued
  ON dashboard.workspace_agent_tasks(space_id, thread_root, agent_type, created_at) WHERE queued AND status = 'todo';
