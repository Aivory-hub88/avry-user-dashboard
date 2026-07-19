-- Deep Diagnostic report storage, keyed per signed-in user.
-- Decisions D1–D3 in docs/DEEP-DIAGNOSTIC-RESULT-PLANNING.md (monorepo):
--   D1: primary key = user_id from the verified JWT; one latest row per user
--       per entity (upsert). History can come later via an append table.
--   D2: own schema `dashboard` — keeps clear of product.diagnostics (free
--       diagnostic) and of any unqualified public-schema leftovers.
--   D3: applied once at deploy time, NOT from application code:
--       docker exec -i avry-postgres psql -U aivory -d aivory < migrations/dashboard-storage.sql
-- Idempotent: safe to re-run.

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
