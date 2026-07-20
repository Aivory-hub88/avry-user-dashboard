-- Deep Diagnostic report storage, keyed per signed-in user.
-- Decisions D1–D3 in docs/DEEP-DIAGNOSTIC-RESULT-PLANNING.md (monorepo):
--   D1: primary key = user_id from the verified JWT; one latest row per user
--       per entity (upsert). History can come later via an append table.
--   D2: own schema `dashboard` — keeps clear of product.diagnostics (free
--       diagnostic) and of any unqualified public-schema leftovers.
--   D3: applied once at deploy time, NOT from application code:
--       docker exec -i avry-postgres psql -U aivory -d aivory < migrations/dashboard-storage.sql
-- Idempotent: safe to re-run.
--
-- Phase E1.3 (docs/OPS-TRANSFORMATION-NARRATIVE-BRIEF.md §8): assessment
-- history / delta. Adds dashboard.diagnostic_history, the append table D1
-- anticipated — INSERT-only, no unique constraint on user_id, one row per
-- successful save to dashboard.diagnostic_contexts (see
-- app/api/storage/[entity]/route.ts POST). Powers the delta chip + sparkline
-- on the result page (E2.3) once a user has ≥2 rows. Pure new read surface —
-- no methodologyVersion bump per E-invariant 1.

CREATE SCHEMA IF NOT EXISTS dashboard;

CREATE TABLE IF NOT EXISTS dashboard.diagnostic_contexts (
  user_id    text PRIMARY KEY,
  data       jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dashboard.diagnostic_results (
  user_id    text PRIMARY KEY,
  data       jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dashboard.blueprints (
  user_id    text PRIMARY KEY,
  data       jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dashboard.roadmaps (
  user_id    text PRIMARY KEY,
  data       jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Phase E1.3 — append-only history for the delta chip + sparkline. No
-- upsert, no unique constraint on user_id: every successful context save
-- gets its own row. `data` holds a minimal snapshot (composite,
-- maturityLevel, per-dimension scores) extracted at write time, NOT the
-- full DiagnosticContext — see app/api/storage/[entity]/route.ts.
CREATE TABLE IF NOT EXISTS dashboard.diagnostic_history (
  id         bigserial PRIMARY KEY,
  user_id    text NOT NULL,
  data       jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS diagnostic_history_user_id_created_at_idx
  ON dashboard.diagnostic_history (user_id, created_at DESC);
