-- CRM WhatsApp: a customer's own Kapso connection (API key + webhook secret
-- are AES-256-GCM encrypted by lib/crypto.ts before they get here).
-- The Aivory-owned number lives in env vars, not in this table.
-- Applied:
--   docker exec -i avry-postgres psql -U aivory -d aivory < migrations/dashboard-whatsapp-connections.sql
CREATE TABLE IF NOT EXISTS dashboard.whatsapp_connections (
  user_id            TEXT PRIMARY KEY,
  phone_number_id    TEXT NOT NULL,
  display_phone      TEXT,
  api_key_enc        BYTEA NOT NULL,
  webhook_secret_enc BYTEA NOT NULL,
  webhook_token      TEXT NOT NULL UNIQUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
