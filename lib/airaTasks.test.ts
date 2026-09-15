import { describe, it, expect } from 'vitest'
import {
  groupIntoOrchestrations,
  isTaskOverdue,
  CHILD_SLA_MINUTES,
  PARENT_SLA_MINUTES,
  type LedgerTask,
} from './airaTasks'

function task(overrides: Partial<LedgerTask> = {}): LedgerTask {
  return {
    task_id: 't1',
    tenant_id: 'u1',
    agent_type: 'autonomous',
    session_id: 's1',
    title: 'Do thing',
    status: 'todo',
    priority: 'normal',
    blocked_reason: null,
    created_at: new Date(Date.now() - 60_000).toISOString(),
    updated_at: new Date(Date.now() - 60_000).toISOString(),
    ...overrides,
  }
}

describe('isTaskOverdue', () => {
  it('done tasks are never overdue', () => {
    const old = task({ status: 'done', created_at: new Date(Date.now() - 10 * 3_600_000).toISOString() })
    expect(isTaskOverdue(old, false)).toBe(false)
    expect(isTaskOverdue(old, true)).toBe(false)
  })

  it('children breach at 15 min, parents at 60', () => {
    const twentyMinAgo = new Date(Date.now() - 20 * 60_000).toISOString()
    const t = task({ status: 'in_progress', created_at: twentyMinAgo })
    expect(isTaskOverdue(t, false)).toBe(true)
    expect(isTaskOverdue(t, true)).toBe(false)
  })

  it('fresh tasks are not overdue', () => {
    expect(isTaskOverdue(task({ status: 'todo' }), false)).toBe(false)
  })
})

describe('groupIntoOrchestrations', () => {
  it('nests chief_of_staff parent with specialist children per session', () => {
    const rows = [
      task({ task_id: 'p', agent_type: 'chief_of_staff', title: 'AIRA-orch: X', created_at: new Date(Date.now() - 300_000).toISOString() }),
      task({ task_id: 'c1', agent_type: 'customer_service', created_at: new Date(Date.now() - 200_000).toISOString() }),
      task({ task_id: 'c2', agent_type: 'leads_qualifier', session_id: 's2' }),
    ]
    const groups = groupIntoOrchestrations(rows)
    expect(groups).toHaveLength(2)
    const s1 = groups.find((g) => g.session_id === 's1')!
    expect(s1.parent?.task_id).toBe('p')
    expect(s1.parent?.is_parent).toBe(true)
    expect(s1.children.map((c) => c.task_id)).toEqual(['c1'])
    expect(s1.children[0].is_parent).toBe(false)
    const s2 = groups.find((g) => g.session_id === 's2')!
    expect(s2.parent).toBeNull()
    expect(s2.children.map((c) => c.task_id)).toEqual(['c2'])
  })

  it('counts open and overdue', () => {
    const old = new Date(Date.now() - (CHILD_SLA_MINUTES + 1) * 60_000).toISOString()
    const rows = [
      task({ task_id: 'p', agent_type: 'chief_of_staff', status: 'in_progress', created_at: new Date(Date.now() - (PARENT_SLA_MINUTES + 1) * 60_000).toISOString() }),
      task({ task_id: 'c1', agent_type: 'autonomous', status: 'blocked', blocked_reason: 'waiting approval', created_at: old }),
      task({ task_id: 'c2', agent_type: 'autonomous', status: 'done', created_at: old }),
    ]
    const [g] = groupIntoOrchestrations(rows)
    expect(g.open_count).toBe(2)
    expect(g.overdue_count).toBe(2)
  })

  it('unscoped rows stand alone', () => {
    const rows = [task({ task_id: 'x', session_id: null })]
    const [g] = groupIntoOrchestrations(rows)
    expect(g.session_id).toBe('')
    expect(g.children).toHaveLength(1)
  })
})
