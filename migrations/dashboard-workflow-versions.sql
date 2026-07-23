-- Version history for Aivory-native workflows (dashboard.workflow_versions).
-- Built to fix "AI generates something wrong, no way back" — the Copilot's
-- Apply-to-existing-canvas flow (handleApplyUpdateExisting, app/workflows/page.tsx)
-- used to overwrite the canvas in place with nothing durable to roll back to.
--
-- Append-only, same convention as dashboard.diagnostic_history
-- (migrations/dashboard-storage.sql): one row per snapshot, no unique
-- constraint on workflow_id, indexed for "most recent first" reads.
-- user_id is best-effort (populated via getAuthUser() when a token is
-- present) since dashboard.workflows itself has no auth/user-scoping yet —
-- see app/api/workflows/route.ts.
--
-- Applied once at deploy time, NOT from application code:
--   docker exec -i avry-postgres psql -U aivory -d aivory < migrations/dashboard-workflow-versions.sql
-- Idempotent: safe to re-run.

CREATE SCHEMA IF NOT EXISTS dashboard;

CREATE TABLE IF NOT EXISTS dashboard.workflow_versions (
  id             bigserial PRIMARY KEY,
  workflow_id    text NOT NULL,
  user_id        text,
  version        integer NOT NULL,
  spec           jsonb NOT NULL,
  canvas         jsonb,
  trigger_reason text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS workflow_versions_workflow_version_idx
  ON dashboard.workflow_versions (workflow_id, version);
CREATE INDEX IF NOT EXISTS workflow_versions_workflow_created_idx
  ON dashboard.workflow_versions (workflow_id, created_at DESC);
