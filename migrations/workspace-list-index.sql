-- Workspace list fast-path (N+1 fix): cover GET /api/workspace ORDER + filters.
-- Applied: docker exec -i avry-postgres psql -U aivory -d aivory < migrations/workspace-list-index.sql

-- List query filters deleted_at IS [NOT] NULL + ORDER BY updated_at DESC.
CREATE INDEX IF NOT EXISTS idx_workspace_docs_list
  ON dashboard.workspace_docs(updated_at DESC) INCLUDE (id, workspace_id, owner, title);

-- Batch ACL lookup: WHERE doc_id = ANY($1) AND user_id = $2.
CREATE INDEX IF NOT EXISTS idx_workspace_doc_acl_user
  ON dashboard.workspace_doc_acl(user_id, doc_id);

-- Batch member lookup: WHERE workspace_id = ANY($1) AND user_id = $2.
-- NOTE: no new index here — workspace_members_pkey is already (workspace_id, user_id),
-- which covers this lookup. A prior version of this migration duplicated it as
-- idx_workspace_members_ws_user; that index was dropped (see cleanup below).

-- Owner fast-path in batch resolution.
CREATE INDEX IF NOT EXISTS idx_workspace_docs_owner
  ON dashboard.workspace_docs(owner) WHERE owner IS NOT NULL;
