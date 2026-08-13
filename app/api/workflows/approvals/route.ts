import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getAuthUser } from '@/lib/serverAuth'

export const runtime = 'nodejs'

function auth(request: NextRequest) {
  try {
    return getAuthUser(request)
  } catch {
    return null
  }
}

/** List pending exception cases for the signed-in reviewer. */
export async function GET(request: NextRequest) {
  const user = auth(request)
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })

  const result = await query(
    `SELECT id, workflow_id, execution_id, status, context, created_at, updated_at
       FROM dashboard.workflow_approval_cases
      WHERE user_id = $1 AND status = 'awaiting_manual_approval'
      ORDER BY created_at DESC`,
    [user.user_id],
  )
  return NextResponse.json({ cases: result.rows })
}

/** Register a Wait execution once its execution-specific resume URL is known. */
export async function POST(request: NextRequest) {
  const user = auth(request)
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const workflowId = typeof body.workflow_id === 'string' ? body.workflow_id.trim() : ''
  const executionId = typeof body.execution_id === 'string' ? body.execution_id.trim() : ''
  const resumeUrl = typeof body.resume_url === 'string' ? body.resume_url.trim() : ''
  if (!workflowId || !executionId || !resumeUrl) {
    return NextResponse.json({ error: 'workflow_id, execution_id, and resume_url are required' }, { status: 400 })
  }

  let parsed: URL
  try {
    parsed = new URL(resumeUrl)
  } catch {
    return NextResponse.json({ error: 'resume_url must be a valid URL' }, { status: 400 })
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return NextResponse.json({ error: 'resume_url must use HTTP or HTTPS' }, { status: 400 })
  }

  const result = await query(
    `INSERT INTO dashboard.workflow_approval_cases
      (user_id, workflow_id, execution_id, resume_url, context)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, workflow_id, execution_id, status, created_at`,
    [user.user_id, workflowId, executionId, resumeUrl, body.context ?? {}],
  )
  return NextResponse.json({ case: result.rows[0] }, { status: 201 })
}
