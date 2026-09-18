import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { workspaceCredential, unauthorized } from '@/lib/workspaceAuth'

/**
 * PATCH /api/aira/tasks/[taskId] — operator intervention on the task ledger.
 *
 * The board is read-only by contract (status moves via approvals), but an
 * orphaned row — in_progress/blocked with no live turn behind it — can
 * neither finish nor park itself, and the rail's live "Running now" feed
 * will never show it. This endpoint is the escape hatch: the owner stops
 * their own stuck task, which flips it to the terminal `cancelled` state.
 * Cancelled rows stay in the DB (audit trail) but leave the board, the
 * counts, and the SLA flags (see the GET filter + lib/airaTasks.ts).
 *
 * Body: { action: 'stop' } (only action today).
 *
 * Rules:
 * - tenant-scoped: task_id + JWT user_id must match, else 404 (no
 *   cross-tenant oracle — a foreign id is indistinguishable from missing).
 * - only open rows (todo/in_progress/blocked) can stop; done/cancelled
 *   rows 409.
 */

export const runtime = 'nodejs'

const STOPPABLE = ['todo', 'in_progress', 'blocked'] as const

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const cred = workspaceCredential(req)
  if (!cred) return unauthorized()
  if (cred.kind !== 'user') {
    return NextResponse.json({ error: 'user session required' }, { status: 403 })
  }
  const { taskId } = await params
  if (!taskId) {
    return NextResponse.json({ error: 'taskId is required' }, { status: 400 })
  }

  let body: unknown = null
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON body is required' }, { status: 400 })
  }
  const action =
    typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>).action
      : null
  if (action !== 'stop') {
    return NextResponse.json(
      { error: "unknown action — expected { action: 'stop' }" },
      { status: 400 },
    )
  }

  try {
    const r = await query(
      `UPDATE cerveau.agent_tasks
       SET status = 'cancelled',
           blocked_reason = 'Stopped by operator from Mission Control',
           updated_at = NOW()
       WHERE task_id = $1 AND tenant_id = $2 AND status = ANY($3::text[])
       RETURNING task_id, tenant_id, agent_type, session_id, title, status,
                 priority, blocked_reason, created_at, updated_at`,
      [taskId, cred.user.user_id, [...STOPPABLE]],
    )
    if (r.rows.length === 0) {
      // Either missing/foreign, or already terminal — distinguish so the
      // UI can say "already stopped" instead of "not found".
      const existing = await query(
        `SELECT status FROM cerveau.agent_tasks WHERE task_id = $1 AND tenant_id = $2`,
        [taskId, cred.user.user_id],
      )
      if (existing.rows.length === 0) {
        return NextResponse.json({ error: 'task not found' }, { status: 404 })
      }
      return NextResponse.json(
        { error: `task is already ${existing.rows[0].status}` },
        { status: 409 },
      )
    }
    return NextResponse.json({ task: r.rows[0] })
  } catch (err) {
    console.error('[api/aira/tasks/stop] query failed:', err)
    return NextResponse.json({ error: 'could not stop task' }, { status: 502 })
  }
}
