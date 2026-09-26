-- Workspace files on Cloudflare R2 (ADR-019 P0).
-- Applied: docker exec -i avry-postgres psql -U aivory -d aivory < migrations/workspace-files.sql
--
-- Bytes live in R2 (bucket R2_BUCKET, never public); this table is the
-- index + ACL anchor. A file belongs to a room (room_id = workspace doc id)
-- or, before approval, to a project request (request_id, P1). ACL is the
-- owning doc's role; the bucket is only reachable through presigned URLs.
--
-- Status: pending (presign issued, bytes not verified) → ready (HEAD matched
-- the declared size) → ingested (text chunked into workspace_chunks, P3)
-- | failed (verification or ingest failed). deleted_at = soft delete.

CREATE TABLE IF NOT EXISTS dashboard.workspace_files (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'default',
  room_id TEXT,
  request_id TEXT,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size BIGINT NOT NULL CHECK (size > 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'ready', 'ingested', 'failed')),
  uploaded_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT workspace_files_owner_present CHECK (room_id IS NOT NULL OR request_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_workspace_files_room
  ON dashboard.workspace_files(room_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_workspace_files_request
  ON dashboard.workspace_files(request_id)
  WHERE request_id IS NOT NULL AND deleted_at IS NULL;
