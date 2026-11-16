-- WhatsApp reply modes: "approval" (the agent drafts, a person presses Send) or "autonomous" (the agent sends,
-- within guardrails). Also: who wrote a draft, why a reply was held back, and a counter for rate limits.
-- Applied:
--   docker exec -i avry-postgres psql -U aivory -d aivory < migrations/dashboard-whatsapp-autonomous.sql
ALTER TABLE dashboard.whatsapp_settings ADD COLUMN IF NOT EXISTS reply_mode TEXT NOT NULL DEFAULT 'approval';
ALTER TABLE dashboard.whatsapp_settings DROP CONSTRAINT IF EXISTS whatsapp_settings_reply_mode_chk;
ALTER TABLE dashboard.whatsapp_settings ADD CONSTRAINT whatsapp_settings_reply_mode_chk CHECK (reply_mode IN ('approval', 'autonomous'));

ALTER TABLE dashboard.whatsapp_drafts ADD COLUMN IF NOT EXISTS writer TEXT;
ALTER TABLE dashboard.whatsapp_drafts ADD COLUMN IF NOT EXISTS note TEXT;

CREATE TABLE IF NOT EXISTS dashboard.whatsapp_auto_replies (
  id         BIGSERIAL PRIMARY KEY,
  user_id    TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS whatsapp_auto_replies_account_idx ON dashboard.whatsapp_auto_replies (user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_auto_replies_contact_idx ON dashboard.whatsapp_auto_replies (user_id, contact_id, sent_at DESC);
