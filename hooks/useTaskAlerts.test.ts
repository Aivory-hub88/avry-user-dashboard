import { describe, expect, it } from 'vitest'
import { taskAlertsFrom } from './useTaskAlerts'
import type { EnrichedTask } from '@/lib/airaTasks'

const task = (o: Partial<EnrichedTask>): EnrichedTask => ({
  task_id: 't1', tenant_id: 'x', agent_type: 'leads_qualifier', session_id: null, title: 'Delegated to lex',
  status: 'blocked', priority: 'normal', blocked_reason: 'Delegation failed: context window',
  created_at: '2026-11-19T00:00:00Z', updated_at: '2026-11-19T00:01:00Z',
  is_parent: false, overdue: false, elapsed_ms: 0, ...o,
})

describe('taskAlertsFrom', () => {
  it('surfaces a blocked task with a non-approval reason', () => {
    expect(taskAlertsFrom([task({})])).toMatchObject([{ taskId: 't1', agentType: 'leads_qualifier', blocked: true }])
  })
  it('skips approval waits (the approval feed owns them)', () => {
    expect(taskAlertsFrom([task({ blocked_reason: 'Waiting for approval of update_lead_stage' })])).toEqual([])
  })
  it('surfaces open tasks past SLA but not healthy or finished ones', () => {
    const out = taskAlertsFrom([
      task({ task_id: 'a', status: 'in_progress', overdue: true, blocked_reason: null }),
      task({ task_id: 'b', status: 'in_progress', overdue: false, blocked_reason: null }),
      task({ task_id: 'c', status: 'done', overdue: false, blocked_reason: null }),
    ])
    expect(out.map((a) => a.taskId)).toEqual(['a'])
    expect(out[0].blocked).toBe(false)
  })
})
