-- Free Business Operations Analysis results, one row per completed run.
--
-- The free analysis (12 operational questions, scored in code, no LLM) runs
-- inside the dashboard for free accounts. Every completed run is appended here
-- so the result follows the account across browsers and the run limit is
-- counted on the server (app/api/diagnostics/free/route.ts,
-- lib/freeAnalysis/store.ts). user_id comes only from the verified JWT.
--
-- Applied once at deploy time, NOT from application code:
--   docker exec -i avry-postgres psql -U aivory -d aivory < migrations/dashboard-free-analysis.sql
-- Idempotent: safe to re-run.

CREATE SCHEMA IF NOT EXISTS dashboard;

CREATE TABLE IF NOT EXISTS dashboard.free_analyses (
  id         bigserial PRIMARY KEY,
  user_id    text NOT NULL,
  data       jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS free_analyses_user_id_created_at_idx
  ON dashboard.free_analyses (user_id, created_at DESC);
