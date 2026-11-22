-- Room admins (like WhatsApp group admins): a per-room grant that can also
-- add/remove people and agents and promote others. Widen the role check on
-- the per-doc ACL; existing editor/viewer rows are untouched.
ALTER TABLE dashboard.workspace_doc_acl
  DROP CONSTRAINT IF EXISTS workspace_doc_acl_role_check;
ALTER TABLE dashboard.workspace_doc_acl
  ADD CONSTRAINT workspace_doc_acl_role_check CHECK (role IN ('admin', 'editor', 'viewer'));
