-- n8n instance credentials, keyed per signed-in user (one instance per user).
-- Backs the ActivationModal's "Save to database" storage preference — until
-- this table existed, that option silently 404'd against a stub endpoint and
-- credentials only ever lived in the browser's localStorage.
-- Same conventions as migrations/dashboard-storage.sql: own `dashboard`
-- schema, user_id (from the verified JWT) as primary key, applied once at
-- deploy time, NOT from application code:
--   docker exec -i avry-postgres psql -U aivory -d aivory < migrations/dashboard-n8n-credentials.sql
-- Idempotent: safe to re-run.
--
-- api_key_encrypted is AES-256-GCM ciphertext (nonce + ciphertext + auth tag,
-- see lib/crypto.ts) — never stored or returned in plaintext.

CREATE SCHEMA IF NOT EXISTS dashboard;

CREATE TABLE IF NOT EXISTS dashboard.n8n_credentials (
  user_id           text PRIMARY KEY,
  instance_url      text NOT NULL,
  api_key_encrypted bytea NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now()
);
