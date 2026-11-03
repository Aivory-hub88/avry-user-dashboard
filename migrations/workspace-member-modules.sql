-- Per-member feature grants. The workspace admin picks which user-dashboard
-- modules (console, agents, workflows, ...) each member may use.
-- NULL = the role's default set (see lib/workspaceModules.ts); owners always
-- get everything and ignore this column.
ALTER TABLE dashboard.workspace_members
  ADD COLUMN IF NOT EXISTS modules TEXT[];
