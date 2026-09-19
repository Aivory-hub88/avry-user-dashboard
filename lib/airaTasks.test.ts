import { describe, it, expect } from 'vitest'
import {
  enrichTask,
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

  it('cancelled tasks are never overdue and never open', () => {
    const old = task({ status: 'cancelled', created_at: new Date(Date.now() - 10 * 3_600_000).toISOString() })
    expect(isTaskOverdue(old, false)).toBe(false)
    expect(isTaskOverdue(old, true)).toBe(false)
    const [g] = groupIntoOrchestrations([
      task({ task_id: 'p', agent_type: 'chief_of_staff', status: 'in_progress', created_at: old.created_at }),
      task({ task_id: 'c', agent_type: 'autonomous', status: 'cancelled', created_at: old.created_at }),
    ])
    expect(g.open_count).toBe(1)
    expect(g.overdue_count).toBe(1)
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

describe('enrichTask elapsed', () => {
  it('open work counts time since it started', () => {
    const now = Date.now()
    const t = task({ status: 'in_progress', created_at: new Date(now - 5 * 60_000).toISOString() })
    expect(enrichTask(t, false, now).elapsed_ms).toBe(5 * 60_000)
  })

  it('finished work reports how long it took, not how long ago it started', () => {
    const now = Date.now()
    const created = new Date(now - 3 * 24 * 3_600_000)
    const t = task({
      status: 'done',
      created_at: created.toISOString(),
      updated_at: new Date(created.getTime() + 4 * 60_000).toISOString(),
    })
    const e = enrichTask(t, false, now)
    expect(e.elapsed_ms).toBe(4 * 60_000)
    expect(e.overdue).toBe(false)
  })

  it('never reports a negative duration for a skewed clock', () => {
    const t = task({ status: 'done', created_at: '2026-09-19T10:00:05Z', updated_at: '2026-09-19T10:00:00Z' })
    expect(enrichTask(t, false).elapsed_ms).toBe(0)
  })
})
