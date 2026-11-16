-- CRM WhatsApp: a customer's own WhatsApp provider connection (Kapso, Meta Cloud API,
-- Twilio, ...). `credentials_enc` is the provider's credentials as JSON and
-- `webhook_secret_enc` the secret Aivory generated for its webhook, both AES-256-GCM
-- encrypted by lib/crypto.ts before they get here. The Aivory-owned number lives in env
-- vars, not in this table.
-- Applied:
--   docker exec -i avry-postgres psql -U aivory -d aivory < migrations/dashboard-whatsapp-connections.sql
CREATE TABLE IF NOT EXISTS dashboard.whatsapp_connections (
  user_id            TEXT PRIMARY KEY,
  provider           TEXT NOT NULL DEFAULT 'kapso',
  display_phone      TEXT,
  credentials_enc    BYTEA NOT NULL,
  webhook_secret_enc BYTEA NOT NULL,
  webhook_token      TEXT NOT NULL UNIQUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
