import { describe, it, expect } from 'vitest'
import { gzipSync } from 'node:zlib'
import {
  decodeArchivedTask,
  decodeArchivedTasks,
  clampDoneDays,
  DONE_WINDOW_DAYS_DEFAULT,
  ARCHIVE_RETENTION_DAYS,
} from './airaArchive'

/** What Cerveau writes: `serde_json` of `AgentTask`, gzipped (chrono => RFC3339). */
function payload(over: Record<string, unknown> = {}): Buffer {
  return gzipSync(
    Buffer.from(
      JSON.stringify({
        task_id: 'a1',
        tenant_id: 'u1',
        agent_type: 'leads_qualifier',
        session_id: 'room-1',
        title: 'Delegated to leads_qualifier: qualify the new leads',
        status: 'done',
        priority: 'normal',
        blocked_reason: null,
        created_at: '2026-09-19T13:36:41.123456Z',
        updated_at: '2026-09-19T13:41:03.000001Z',
        ...over,
      }),
    ),
  )
}

describe('decodeArchivedTask', () => {
  it('turns a Cerveau archive payload back into a done ledger task', () => {
    const t = decodeArchivedTask(payload())
    expect(t).toMatchObject({
      task_id: 'a1',
      tenant_id: 'u1',
      agent_type: 'leads_qualifier',
      session_id: 'room-1',
      status: 'done',
      blocked_reason: null,
      created_at: '2026-09-19T13:36:41.123456Z',
      updated_at: '2026-09-19T13:41:03.000001Z',
    })
    expect(new Date(t!.updated_at).getTime()).toBeGreaterThan(new Date(t!.created_at).getTime())
  })

  it('keeps the delegation link and result summary when Cerveau wrote them (ADR-014 A2)', () => {
    const t = decodeArchivedTask(
      payload({ delegated_by: 'chief_of_staff', delegation_id: 'd-9', result_summary: 'qualified 3 leads' }),
    )
    expect(t?.delegated_by).toBe('chief_of_staff')
    expect(t?.delegation_id).toBe('d-9')
    expect(t?.result_summary).toBe('qualified 3 leads')
  })

  it('reads a payload archived before the delegation fields existed', () => {
    const t = decodeArchivedTask(payload())
    expect(t?.delegated_by).toBeUndefined()
    expect(t?.result_summary).toBeUndefined()
  })

  it('always reports done, whatever an older payload said', () => {
    expect(decodeArchivedTask(payload({ status: 'in_progress' }))?.status).toBe('done')
  })

  it('falls back to created_at when updated_at is missing, and defaults priority', () => {
    const t = decodeArchivedTask(payload({ updated_at: undefined, priority: undefined }))
    expect(t?.updated_at).toBe('2026-09-19T13:36:41.123456Z')
    expect(t?.priority).toBe('normal')
  })

  it('returns null instead of throwing on anything that is not a usable task', () => {
    expect(decodeArchivedTask(null)).toBeNull()
    expect(decodeArchivedTask('nope')).toBeNull()
    expect(decodeArchivedTask(Buffer.from('not gzip at all'))).toBeNull()
    expect(decodeArchivedTask(gzipSync(Buffer.from('not json')))).toBeNull()
    expect(decodeArchivedTask(gzipSync(Buffer.from('123')))).toBeNull()
    for (const missing of ['task_id', 'tenant_id', 'agent_type', 'created_at']) {
      expect(decodeArchivedTask(payload({ [missing]: undefined }))).toBeNull()
    }
  })
})

describe('decodeArchivedTasks', () => {
  it('drops corrupt rows without hiding the good ones', () => {
    const out = decodeArchivedTasks([payload({ task_id: 'a' }), Buffer.from('garbage'), payload({ task_id: 'b' })], {
      tenantId: 'u1',
      sessionId: null,
    })
    expect(out.map((t) => t.task_id)).toEqual(['a', 'b'])
  })

  it("never returns another tenant's task even if the SQL scope let one through", () => {
    const out = decodeArchivedTasks([payload({ tenant_id: 'someone-else' })], { tenantId: 'u1', sessionId: null })
    expect(out).toEqual([])
  })

  it('filters by session, which only exists inside the payload', () => {
    const rows = [payload({ task_id: 'a', session_id: 'room-1' }), payload({ task_id: 'b', session_id: 'room-2' }), payload({ task_id: 'c', session_id: null })]
    expect(decodeArchivedTasks(rows, { tenantId: 'u1', sessionId: 'room-2' }).map((t) => t.task_id)).toEqual(['b'])
    expect(decodeArchivedTasks(rows, { tenantId: 'u1', sessionId: null })).toHaveLength(3)
  })
})

describe('clampDoneDays', () => {
  it('defaults, clamps to the archive retention, and ignores nonsense', () => {
    expect(clampDoneDays(null)).toBe(DONE_WINDOW_DAYS_DEFAULT)
    expect(clampDoneDays('abc')).toBe(DONE_WINDOW_DAYS_DEFAULT)
    expect(clampDoneDays('0')).toBe(DONE_WINDOW_DAYS_DEFAULT)
    expect(clampDoneDays('-3')).toBe(DONE_WINDOW_DAYS_DEFAULT)
    expect(clampDoneDays('7')).toBe(7)
    expect(clampDoneDays('999')).toBe(ARCHIVE_RETENTION_DAYS)
  })
})
