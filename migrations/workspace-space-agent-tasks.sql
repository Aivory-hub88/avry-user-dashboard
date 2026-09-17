-- Team Space agent tasks (Phase 3, F4).
-- Applied: docker exec -i avry-postgres psql -U aivory -d aivory < migrations/workspace-space-agent-tasks.sql
--
-- Ledger sisi-Space (bukan ledger Cerveau/Aira): 1 baris per (@agent, pesan
-- pemicu). Execution dijemput lewat POST .../agent-tasks/[task]/run yang
-- meneruskan JWT user ke backend /api/v1/telegram/agent-chat — tanpa service
-- baru (SCOPE §4, ADR-008 caller-synthesizes).
--
-- Status: todo → in_progress → done | blocked → done | failed | cancelled.
-- blocked = Cerveau memarkir turn menunggu approval (approval_ref terisi);
-- Deny = nol tulis (task → cancelled, tidak ada pesan balasan).

CREATE TABLE IF NOT EXISTS dashboard.workspace_agent_tasks (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL,
  thread_root TEXT NOT NULL REFERENCES dashboard.workspace_threads(id) ON DELETE CASCADE,
  trigger_msg TEXT NOT NULL,
  agent_type TEXT NOT NULL,
  instruction TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'todo'
    CHECK (status IN ('todo', 'in_progress', 'blocked', 'done', 'failed', 'cancelled')),
  reason TEXT NOT NULL DEFAULT '',
  result_msg TEXT,
  approval_ref JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_agent_tasks_thread
  ON dashboard.workspace_agent_tasks(space_id, thread_root, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_workspace_agent_tasks_status
  ON dashboard.workspace_agent_tasks(status) WHERE status IN ('todo', 'in_progress', 'blocked');
