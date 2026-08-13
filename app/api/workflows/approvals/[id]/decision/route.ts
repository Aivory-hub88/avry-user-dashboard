import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getAuthUser } from '@/lib/serverAuth'

export const runtime = 'nodejs'

/** Submit approve/reject and resume the exact waiting n8n execution. */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  let user
  try {
    user = getAuthUser(request)
  } catch {
    user = null
  }
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })

  const { id } = await context.params
  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const decision = body.decision === 'approve' || body.approved === true
    ? 'approve'
    : body.decision === 'reject' || body.approved === false
      ? 'reject'
      : null
  if (!decision) return NextResponse.json({ error: 'decision must be approve or reject' }, { status: 400 })

  const existing = await query(
    `SELECT id, workflow_id, execution_id, resume_url, status
       FROM dashboard.workflow_approval_cases
      WHERE id = $1 AND user_id = $2
      LIMIT 1`,
    [id, user.user_id],
  )
  const approval = existing.rows[0]
  if (!approval) return NextResponse.json({ error: 'Approval case not found' }, { status: 404 })
  if (approval.status !== 'awaiting_manual_approval') {
    return NextResponse.json({ error: `Approval case is already ${approval.status}` }, { status: 409 })
  }

  const approved = decision === 'approve'
  const payload = {
    is_approved: approved,
    approval_status: approved ? 'approved' : 'rejected',
    decision,
    approval_case_id: String(approval.id),
    reviewer_id: user.user_id,
  }

  let response: Response
  try {
    response = await fetch(approval.resume_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    })
  } catch (error) {
    await query(
      `UPDATE dashboard.workflow_approval_cases
          SET status = 'failed', decision = $1, updated_at = now()
        WHERE id = $2`,
      [payload, approval.id],
    )
    return NextResponse.json({ error: 'n8n resume endpoint was unreachable' }, { status: 502 })
  }

  if (!response.ok) {
    await query(
      `UPDATE dashboard.workflow_approval_cases
          SET status = 'failed', decision = $1, updated_at = now()
        WHERE id = $2`,
      [payload, approval.id],
    )
    return NextResponse.json({ error: `n8n resume endpoint returned ${response.status}` }, { status: 502 })
  }

  const updated = await query(
    `UPDATE dashboard.workflow_approval_cases
        SET status = 'resumed', decision = $1, decided_at = now(), updated_at = now()
      WHERE id = $2
      RETURNING id, workflow_id, execution_id, status, decision, decided_at`,
    [payload, approval.id],
  )
  return NextResponse.json({ case: updated.rows[0] })
}
