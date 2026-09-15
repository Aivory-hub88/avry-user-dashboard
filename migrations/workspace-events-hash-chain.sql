-- Buzz-style audit hash-chain for dashboard.workspace_events.
-- Each row's `hash` = SHA-256(prev_hash || id || kind || doc_id || actor_type
-- || actor_id || created_at || payload), chained per workspace_id (tenant
-- boundary, mirrors Buzz's per-community chain). Tampering with or deleting
-- a row breaks every hash after it — verifiable without trusting the DB.
-- Applied: docker exec -i avry-postgres psql -U aivory -d aivory < migrations/workspace-events-hash-chain.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE dashboard.workspace_events
  ADD COLUMN IF NOT EXISTS prev_hash TEXT,
  ADD COLUMN IF NOT EXISTS hash TEXT;

-- Backfill: walk each workspace's existing rows in id order and chain them.
-- Idempotent — only touches workspaces that still have an unhashed row.
DO $$
DECLARE
  ws TEXT;
  rec RECORD;
  prev TEXT;
  cur TEXT;
BEGIN
  FOR ws IN
    SELECT DISTINCT workspace_id FROM dashboard.workspace_events WHERE hash IS NULL
  LOOP
    prev := NULL;
    FOR rec IN
      SELECT id, kind, doc_id, actor_type, actor_id, created_at, payload
      FROM dashboard.workspace_events
      WHERE workspace_id = ws
      ORDER BY id ASC
    LOOP
      cur := encode(
        digest(
          COALESCE(prev, '') || '|' || rec.id || '|' || rec.kind || '|' ||
          rec.doc_id || '|' || rec.actor_type || '|' || COALESCE(rec.actor_id, '') || '|' ||
          rec.created_at::text || '|' || rec.payload::text,
          'sha256'
        ),
        'hex'
      );
      UPDATE dashboard.workspace_events SET prev_hash = prev, hash = cur WHERE id = rec.id;
      prev := cur;
    END LOOP;
  END LOOP;
END $$;

ALTER TABLE dashboard.workspace_events
  ALTER COLUMN hash SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workspace_events_hash
  ON dashboard.workspace_events(hash);
