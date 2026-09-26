-- Project requests (ADR-019 P1).
-- Applied: docker exec -i avry-postgres psql -U aivory -d aivory < migrations/project-requests.sql
--
-- A team member asks for a project; a team owner approves it and the
-- request becomes a room (a workspace_docs row, room_id below). Files
-- uploaded while drafting live in workspace_files with request_id set and
-- gain room_id on approval.
--
-- Status: draft → submitted → approved | changes_requested | rejected;
-- changes_requested → submitted; draft/submitted/changes_requested → withdrawn.
-- The requester edits only in draft / changes_requested.

CREATE TABLE IF NOT EXISTS dashboard.project_requests (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES dashboard.workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  goal TEXT NOT NULL DEFAULT '',
  deadline DATE,
  priority TEXT NOT NULL DEFAULT 'Med' CHECK (priority IN ('Low', 'Med', 'High')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'changes_requested', 'approved', 'rejected', 'withdrawn')),
  requested_by TEXT NOT NULL,
  requested_by_name TEXT NOT NULL DEFAULT '',
  -- [{ label, value }] free-form brief details (budget, client, …)
  fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- { columns: [..], rows: [[..]] } seeded into the room's database on approval
  data_table JSONB NOT NULL DEFAULT '{"columns":[],"rows":[]}'::jsonb,
  -- [{ email, role }] people to add to the room besides the team
  members JSONB NOT NULL DEFAULT '[]'::jsonb,
  agents TEXT[] NOT NULL DEFAULT '{}',
  reviewer TEXT,
  review_note TEXT,
  reviewed_at TIMESTAMPTZ,
  room_id TEXT,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_requests_inbox
  ON dashboard.project_requests(workspace_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_requests_mine
  ON dashboard.project_requests(requested_by, updated_at DESC);
