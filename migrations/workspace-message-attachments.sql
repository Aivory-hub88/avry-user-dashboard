-- Files attached to a room message (Workspace composer attachments).
-- Applied: docker exec -i avry-postgres psql -U aivory -d aivory < migrations/workspace-message-attachments.sql
--
-- Each element: { fileId, name, mime, size, thumb? } where fileId is a row of
-- dashboard.workspace_files (the bytes live on R2) and thumb is a small JPEG data
-- URL for image tiles. NULL = no attachments. Additive, nullable, no backfill; the
-- messages route only writes the column when a message actually has attachments, so
-- plain messages keep working before this is applied.

ALTER TABLE dashboard.workspace_messages
  ADD COLUMN IF NOT EXISTS attachments JSONB;
