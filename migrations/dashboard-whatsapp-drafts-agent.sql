-- WhatsApp reply drafts written by the customer's own agent (Lex, Teo, ...) instead of Aivory's assistant.
-- NULL = no agent chosen (only the Aivory-owned number may then fall back to the assistant).
-- Applied:
--   docker exec -i avry-postgres psql -U aivory -d aivory < migrations/dashboard-whatsapp-drafts-agent.sql
ALTER TABLE dashboard.whatsapp_settings ADD COLUMN IF NOT EXISTS draft_agent TEXT;
