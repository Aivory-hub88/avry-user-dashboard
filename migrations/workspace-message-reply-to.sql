-- Exact reply target for Console-style rooms (ADR-019 P2).
-- Applied: docker exec -i avry-postgres psql -U aivory -d aivory < migrations/workspace-message-reply-to.sql
--
-- Threads stay flat (thread_root = the root), but a room quotes the message
-- you actually answered, which may be a reply itself (e.g. an agent's
-- answer). reply_to holds that message id; NULL = no quote / legacy rows,
-- which fall back to quoting thread_root. Additive, nullable, no backfill.

ALTER TABLE dashboard.workspace_messages
  ADD COLUMN IF NOT EXISTS reply_to TEXT;
