-- ADR-021 §4 (follow-up #5): reminders with the room closed, waits, quiet and failed runs.
-- Applied: docker exec -i avry-postgres psql -U aivory -d aivory < migrations/workspace-agent-followup5.sql
-- Requires migrations/workspace-agent-comms.sql. Additive only: older code ignores these columns.
--
-- workspace_agent_reminders
--   credential_owner  user_id of the credential the creating turn ran under. The backend sweeper mints a
--                     short-lived token for this member to fire the reminder with nobody in the room.
--                     NULL = only the room poll fires it (rows from before this migration, or handed back).
--   missed_policy     run_once (default): a late reminder fires once and says it is late.
--                     skip: a reminder claimed more than 10 minutes after fire_at is dropped.
--   fire_outcome      on_time | late | skipped, set when the reminder is claimed.
--   wait_id           the wait this reminder wakes (team_wait with `until`, or a webhook wake).
--
-- workspace_agent_waits: an agent's open "I am blocked on X" (team_wait). request_text is copied by the
-- room from the turn the agent was working on, so it survives the end of the turn and any compaction.

ALTER TABLE dashboard.workspace_agent_reminders
  ADD COLUMN IF NOT EXISTS credential_owner TEXT,
  ADD COLUMN IF NOT EXISTS missed_policy TEXT NOT NULL DEFAULT 'run_once',
  ADD COLUMN IF NOT EXISTS fire_outcome TEXT,
  ADD COLUMN IF NOT EXISTS wait_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspace_agent_reminders_missed_policy_check') THEN
    ALTER TABLE dashboard.workspace_agent_reminders
      ADD CONSTRAINT workspace_agent_reminders_missed_policy_check CHECK (missed_policy IN ('run_once', 'skip'));
  END IF;
END $$;

-- The backend sweeper's lookup: due, unfired, with an owner to mint for.
CREATE INDEX IF NOT EXISTS idx_workspace_agent_reminders_sweep
  ON dashboard.workspace_agent_reminders(fire_at, space_id, credential_owner)
  WHERE fired_at IS NULL AND credential_owner IS NOT NULL;

CREATE TABLE IF NOT EXISTS dashboard.workspace_agent_waits (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL,
  thread_root TEXT NOT NULL REFERENCES dashboard.workspace_threads(id) ON DELETE CASCADE,
  agent_type TEXT NOT NULL,
  task_id TEXT,
  request_text TEXT NOT NULL,
  note TEXT NOT NULL,
  credential_owner TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'expired')),
  close_note TEXT,
  wake_count INTEGER NOT NULL DEFAULT 0,
  last_woken_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '14 days'
);

CREATE INDEX IF NOT EXISTS idx_workspace_agent_waits_open
  ON dashboard.workspace_agent_waits(space_id, thread_root, agent_type, created_at) WHERE status = 'open';
