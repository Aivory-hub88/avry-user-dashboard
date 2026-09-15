-- Workspace event log (Buzz-style append-only kind log).
-- Mirrors dashboard.workspace_activity as a single source of truth where every
-- human/agent action is one signed-shape event: a namespaced `kind` + JSONB
-- payload. New feature = new kind string; existing readers ignore unknown kinds.
-- Applied: docker exec -i avry-postgres psql -U aivory -d aivory < migrations/workspace-events.sql

CREATE TABLE IF NOT EXISTS dashboard.workspace_events (
  id BIGSERIAL PRIMARY KEY,
  kind TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT 'default',
  doc_id TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'agent', 'system')),
  actor_id TEXT,
  actor_name TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_events_doc_time
  ON dashboard.workspace_events(doc_id, id DESC);

CREATE INDEX IF NOT EXISTS idx_workspace_events_workspace_time
  ON dashboard.workspace_events(workspace_id, id DESC);

CREATE INDEX IF NOT EXISTS idx_workspace_events_kind
  ON dashboard.workspace_events(kind);

-- One-time backfill from the legacy activity table (idempotent: only rows
-- whose activity id is not yet recorded in the payload).
DO $$
BEGIN
  IF to_regclass('dashboard.workspace_activity') IS NOT NULL THEN
    INSERT INTO dashboard.workspace_events
      (kind, workspace_id, doc_id, actor_type, actor_id, actor_name, payload, created_at)
    SELECT
      a.action, a.workspace_id, a.doc_id, a.actor_type, a.actor_id, a.actor_name,
      jsonb_build_object(
        'activity_id', a.id,
        'summary', a.summary,
        'status', a.status,
        'target_type', a.target_type,
        'target_id', a.target_id,
        'metadata', COALESCE(a.metadata, '{}'::jsonb),
        'backfilled', true
      ),
      a.created_at
    FROM dashboard.workspace_activity a
    WHERE NOT EXISTS (
      SELECT 1 FROM dashboard.workspace_events e
      WHERE e.payload ? 'activity_id'
        AND (e.payload->>'activity_id')::bigint = a.id
    );
  END IF;
END $$;
