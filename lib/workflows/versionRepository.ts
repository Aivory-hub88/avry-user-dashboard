/**
 * Version history for Aivory-native workflows (dashboard.workflow_versions,
 * migrations/dashboard-workflow-versions.sql).
 *
 * Snapshot-on-write, not diff-on-write: each call stores a full spec+canvas
 * copy. Best-effort — a snapshot failure must never block the mutation it's
 * attached to (same non-fatal-insert convention as dashboard.diagnostic_history
 * in app/api/storage/[entity]/route.ts).
 *
 * Node runtime only — routes importing this must declare
 * `export const runtime = 'nodejs'`.
 */
import { query } from '@/lib/db'
import type { AivoryWorkflowSpec } from '@/types/workflow'
import type { CanvasState } from '@/lib/workflows/canvasRepository'

export type VersionTriggerReason =
  | 'ai_apply'
  | 'manual_edit'
  | 'status_change'
  | 'title_change'
  | 'restore'

export interface WorkflowVersion {
  id: number
  workflowId: string
  userId: string | null
  version: number
  spec: AivoryWorkflowSpec
  canvas: CanvasState | null
  triggerReason: VersionTriggerReason
  createdAt: string
}

/**
 * Snapshots the CURRENT (pre-change) spec/canvas for a workflow. Call this
 * BEFORE applying a mutation, not after — the whole point is to capture what
 * existed right before something (often an AI edit) overwrote it.
 * Never throws: logs and swallows on failure so a version-history hiccup
 * can't block the actual save the user is waiting on.
 */
export async function snapshotVersion(
  workflowId: string,
  spec: AivoryWorkflowSpec,
  canvas: CanvasState | null,
  reason: VersionTriggerReason,
  userId?: string | null
): Promise<void> {
  try {
    const next = await query(
      'SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM dashboard.workflow_versions WHERE workflow_id = $1',
      [workflowId]
    )
    const version = next.rows[0]?.next_version ?? 1
    await query(
      `INSERT INTO dashboard.workflow_versions (workflow_id, user_id, version, spec, canvas, trigger_reason)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [workflowId, userId ?? null, version, JSON.stringify(spec), canvas ? JSON.stringify(canvas) : null, reason]
    )
  } catch (err) {
    console.error(`[versionRepository] snapshotVersion failed for workflow ${workflowId} (non-fatal):`, err)
  }
}

export async function listVersions(workflowId: string): Promise<WorkflowVersion[]> {
  const result = await query(
    `SELECT id, workflow_id, user_id, version, spec, canvas, trigger_reason, created_at
     FROM dashboard.workflow_versions WHERE workflow_id = $1 ORDER BY version DESC`,
    [workflowId]
  )
  return result.rows.map(rowToVersion)
}

export async function getVersion(workflowId: string, version: number): Promise<WorkflowVersion | null> {
  const result = await query(
    `SELECT id, workflow_id, user_id, version, spec, canvas, trigger_reason, created_at
     FROM dashboard.workflow_versions WHERE workflow_id = $1 AND version = $2`,
    [workflowId, version]
  )
  const row = result.rows[0]
  return row ? rowToVersion(row) : null
}

function rowToVersion(row: any): WorkflowVersion {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    userId: row.user_id,
    version: row.version,
    spec: row.spec,
    canvas: row.canvas,
    triggerReason: row.trigger_reason,
    createdAt: row.created_at,
  }
}
