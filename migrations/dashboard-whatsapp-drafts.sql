-- CRM WhatsApp: per-account setting for AI-drafted replies, and the latest draft per contact.
-- Drafts are suggestions only; a person always presses Send.
-- Applied:
--   docker exec -i avry-postgres psql -U aivory -d aivory < migrations/dashboard-whatsapp-drafts.sql
CREATE TABLE IF NOT EXISTS dashboard.whatsapp_settings (
  user_id       TEXT PRIMARY KEY,
  draft_replies BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dashboard.whatsapp_drafts (
  user_id           TEXT NOT NULL,
  contact_id        TEXT NOT NULL,
  body              TEXT NOT NULL,
  source_message_id TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, contact_id)
);
