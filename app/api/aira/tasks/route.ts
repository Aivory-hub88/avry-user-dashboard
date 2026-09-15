import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { workspaceCredential, unauthorized } from '@/lib/workspaceAuth'

/**
 * GET /api/aira/tasks — Aira task ledger for kanban render.
 *
 * Reads the agent-owned task rows zeroclaw persists in cerveau.agent_tasks
 * (task_create / task_update_status / task_list tools). Response is already
 * grouped into kanban columns so the client can render without reshaping.
 *
 * Query params:
 *   agent_type  filter to one agent (default: all — Aira + specialists)
 *   session_id  filter to one room/console session
 *   status      filter to one column (todo | in_progress | blocked | done)
 *   limit       max rows, default 100, capped at 500
 *
 * Auth: user JWT is tenant-isolated to their own user_id; service token
 * may pass an explicit tenant_id (Cerveau → dashboard server-side calls).
 *
 * Response: { tasks: Task[], columns: { todo, in_progress, blocked, done },
 *             counts: {...} }
 */

export const runtime = 'nodejs'

const VALID_STATUSES = ['todo', 'in_progress', 'blocked', 'done'] as const
type Status = (typeof VALID_STATUSES)[number]

const MAX_LIMIT = 500
const DEFAULT_LIMIT = 100

interface TaskRow {
  task_id: string
  tenant_id: string
  agent_type: string
  session_id: string | null
  title: string
  status: string
  priority: string
  blocked_reason: string | null
  created_at: string
  updated_at: string
}

function emptyColumns(): Record<Status, TaskRow[]> {
  return { todo: [], in_progress: [], blocked: [], done: [] }
}

export async function GET(req: NextRequest) {
  const cred = workspaceCredential(req)
  if (!cred) return unauthorized()

  const params = req.nextUrl.searchParams
  const agentType = (params.get('agent_type') || '').trim() || null
  const sessionId = (params.get('session_id') || '').trim() || null
  const statusParam = (params.get('status') || '').trim() || null
  if (statusParam && !(VALID_STATUSES as readonly string[]).includes(statusParam)) {
    return NextResponse.json(
      { error: `invalid status — expected one of ${VALID_STATUSES.join(', ')}` },
      { status: 400 },
    )
  }
  const limit = Math.min(
    Math.max(parseInt(params.get('limit') || '', 10) || DEFAULT_LIMIT, 1),
    MAX_LIMIT,
  )

  // Tenant isolation: users always see their own rows. Service callers
  // (Cerveau) must name the tenant explicitly — never a cross-tenant dump.
  let tenantId: string | null = null
  if (cred.kind === 'user') {
    tenantId = cred.user.user_id
  } else {
    tenantId = (params.get('tenant_id') || '').trim() || null
    if (!tenantId) {
      return NextResponse.json(
        { error: 'tenant_id is required for service callers' },
        { status: 400 },
      )
    }
  }

  const conditions: string[] = ['tenant_id = $1']
  const values: unknown[] = [tenantId]
  if (agentType) {
    values.push(agentType)
    conditions.push(`agent_type = $${values.length}`)
  }
  if (sessionId) {
    values.push(sessionId)
    conditions.push(`session_id = $${values.length}`)
  }
  if (statusParam) {
    values.push(statusParam)
    conditions.push(`status = $${values.length}`)
  }
  values.push(limit)

  try {
    const r = await query(
      `SELECT task_id, tenant_id, agent_type, session_id, title, status,
              priority, blocked_reason, created_at, updated_at
       FROM cerveau.agent_tasks
       WHERE ${conditions.join(' AND ')}
       ORDER BY updated_at DESC
       LIMIT $${values.length}`,
      values,
    )
    const tasks = r.rows as TaskRow[]
    const columns = emptyColumns()
    for (const t of tasks) {
      const key = (VALID_STATUSES as readonly string[]).includes(t.status)
        ? (t.status as Status)
        : 'todo'
      columns[key].push(t)
    }
    return NextResponse.json({
      tasks,
      columns,
      counts: {
        todo: columns.todo.length,
        in_progress: columns.in_progress.length,
        blocked: columns.blocked.length,
        done: columns.done.length,
        total: tasks.length,
      },
    })
  } catch (err) {
    console.error('[api/aira/tasks] query failed:', err)
    return NextResponse.json({ error: 'task ledger unavailable' }, { status: 502 })
  }
}
