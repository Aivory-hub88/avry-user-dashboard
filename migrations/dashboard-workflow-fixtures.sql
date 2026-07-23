-- Captured n8n execution data, used as fixtures for regression-comparing a
-- workflow's future runs against a known-good (or known-bad) past run — the
-- n8m-inspired "capture" half of fixture-based regression testing. Replay
-- (running offline against pinned data) is a separate, VPS-side capability;
-- this table just stores what got captured.
--
-- Same conventions as migrations/dashboard-n8n-credentials.sql: own
-- `dashboard` schema, applied once at deploy time, NOT from application
-- code:
--   docker exec -i avry-postgres psql -U aivory -d aivory < migrations/dashboard-workflow-fixtures.sql
-- Idempotent: safe to re-run.
--
-- Unlike dashboard.workflows (still file-backed, unauthenticated today),
-- this table requires a real signed-in user_id — capturing a fixture reads
-- from the user's own n8n instance via their stored credentials
-- (dashboard.n8n_credentials), the same trust boundary as
-- app/api/n8n/workflow/[id]/executions/route.ts.

CREATE SCHEMA IF NOT EXISTS dashboard;

CREATE TABLE IF NOT EXISTS dashboard.workflow_fixtures (
  id           bigserial PRIMARY KEY,
  user_id      text NOT NULL,
  workflow_id  text NOT NULL,
  execution_id text NOT NULL,
  name         text NOT NULL,
  run_data     jsonb NOT NULL,
  captured_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workflow_fixtures_workflow_captured_idx
  ON dashboard.workflow_fixtures (workflow_id, captured_at DESC);
