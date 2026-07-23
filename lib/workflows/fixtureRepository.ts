/**
 * Captured n8n execution fixtures (dashboard.workflow_fixtures,
 * migrations/dashboard-workflow-fixtures.sql) — the "capture" half of
 * fixture-based regression testing (see lib/workflows/fixtureDiff.ts for the
 * "compare" half). Requires a real signed-in user — capturing reads from
 * the user's own n8n instance via their stored credentials.
 *
 * Node runtime only — routes importing this must declare
 * `export const runtime = 'nodejs'`.
 */
import { query } from '@/lib/db'

export interface WorkflowFixture {
  id: number
  userId: string
  workflowId: string
  executionId: string
  name: string
  runData: unknown
  capturedAt: string
}

export async function captureFixture(
  userId: string,
  workflowId: string,
  executionId: string,
  name: string,
  runData: unknown
): Promise<WorkflowFixture> {
  const result = await query(
    `INSERT INTO dashboard.workflow_fixtures (user_id, workflow_id, execution_id, name, run_data)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, user_id, workflow_id, execution_id, name, run_data, captured_at`,
    [userId, workflowId, executionId, name, JSON.stringify(runData)]
  )
  return rowToFixture(result.rows[0])
}

export async function listFixtures(workflowId: string): Promise<WorkflowFixture[]> {
  const result = await query(
    `SELECT id, user_id, workflow_id, execution_id, name, run_data, captured_at
     FROM dashboard.workflow_fixtures WHERE workflow_id = $1 ORDER BY captured_at DESC`,
    [workflowId]
  )
  return result.rows.map(rowToFixture)
}

export async function getFixture(fixtureId: number): Promise<WorkflowFixture | null> {
  const result = await query(
    `SELECT id, user_id, workflow_id, execution_id, name, run_data, captured_at
     FROM dashboard.workflow_fixtures WHERE id = $1`,
    [fixtureId]
  )
  const row = result.rows[0]
  return row ? rowToFixture(row) : null
}

export async function deleteFixture(fixtureId: number): Promise<void> {
  await query('DELETE FROM dashboard.workflow_fixtures WHERE id = $1', [fixtureId])
}

function rowToFixture(row: any): WorkflowFixture {
  return {
    id: row.id,
    userId: row.user_id,
    workflowId: row.workflow_id,
    executionId: row.execution_id,
    name: row.name,
    runData: row.run_data,
    capturedAt: row.captured_at,
  }
}
