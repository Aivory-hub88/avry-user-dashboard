-- Pending workflow exception approvals.
-- Apply once at deploy time:
-- docker exec -i avry-postgres psql -U aivory -d aivory < migrations/dashboard-workflow-approval-cases.sql

CREATE SCHEMA IF NOT EXISTS dashboard;

CREATE TABLE IF NOT EXISTS dashboard.workflow_approval_cases (
  id              bigserial PRIMARY KEY,
  user_id         text NOT NULL,
  workflow_id     text NOT NULL,
  execution_id    text NOT NULL,
  resume_url      text NOT NULL,
  status          text NOT NULL DEFAULT 'awaiting_manual_approval'
                  CHECK (status IN ('awaiting_manual_approval', 'approved', 'rejected', 'resumed', 'failed')),
  context         jsonb NOT NULL DEFAULT '{}'::jsonb,
  decision        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  decided_at      timestamptz
);

CREATE INDEX IF NOT EXISTS workflow_approval_cases_user_status_idx
  ON dashboard.workflow_approval_cases (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS workflow_approval_cases_workflow_execution_idx
  ON dashboard.workflow_approval_cases (workflow_id, execution_id);
