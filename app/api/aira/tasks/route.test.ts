/**
 * GET /api/aira/tasks — the board reads live rows AND Cerveau's archive of
 * finished tasks. `query` is mocked: 1st call = live table, 2nd = archive.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { gzipSync } from 'node:zlib'

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }))
vi.mock('@/lib/db', () => ({ query: queryMock }))
vi.mock('@/lib/serverAuth', () => ({ getAuthUserWithToken: () => null }))

import { GET } from './route'

process.env.COLLAB_SERVICE_TOKEN = 'svc-token'

const NOW = Date.now()
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString()

function req(qs = '') {
  const params = new URLSearchParams(qs)
  if (!params.has('tenant_id')) params.set('tenant_id', 'u1')
  return new NextRequest(`http://x/api/aira/tasks?${params.toString()}`, {
    headers: { 'x-service-token': 'svc-token' },
  })
}

function liveRow(over: Record<string, unknown> = {}) {
  return {
    task_id: 'live-1',
    tenant_id: 'u1',
    agent_type: 'chief_of_staff',
    session_id: 'room-1',
    title: 'AIRA-orch: qualify leads',
    status: 'in_progress',
    priority: 'normal',
    blocked_reason: null,
    created_at: iso(120_000),
    updated_at: iso(60_000),
    ...over,
  }
}

function archived(over: Record<string, unknown> = {}) {
  return {
    payload: gzipSync(
      Buffer.from(
        JSON.stringify({
          task_id: 'done-1',
          tenant_id: 'u1',
          agent_type: 'leads_qualifier',
          session_id: 'room-1',
          title: 'Delegated to leads_qualifier: qualify the new leads',
          status: 'done',
          priority: 'normal',
          blocked_reason: null,
          created_at: iso(600_000),
          updated_at: iso(300_000),
          result_summary: 'qualified 3 leads',
          ...over,
        }),
      ),
    ),
  }
}

beforeEach(() => {
  queryMock.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('GET /api/aira/tasks — finished work', () => {
  it('shows archived tasks in the Done column, counted, beside live ones', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [liveRow()] })
      .mockResolvedValueOnce({ rows: [archived()] })
    const res = await GET(req())
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.columns.done.map((t: { task_id: string }) => t.task_id)).toEqual(['done-1'])
    expect(j.columns.in_progress.map((t: { task_id: string }) => t.task_id)).toEqual(['live-1'])
    expect(j.counts).toMatchObject({ done: 1, in_progress: 1, total: 2 })
    const done = j.columns.done[0]
    expect(done.status).toBe('done')
    expect(done.result_summary).toBe('qualified 3 leads')
    expect(done.overdue).toBe(false)
    expect(done.elapsed_ms).toBe(300_000) // it took 5 minutes, not "10 minutes since it began"
  })

  it('a board with only finished work is no longer empty', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [archived()] })
    const j = await (await GET(req())).json()
    expect(j.counts.total).toBe(1)
    expect(j.counts.done).toBe(1)
  })

  it('groups a finished step under its orchestration like any other child', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [liveRow()] })
      .mockResolvedValueOnce({ rows: [archived()] })
    const j = await (await GET(req())).json()
    expect(j.orchestrations).toHaveLength(1)
    expect(j.orchestrations[0].parent.task_id).toBe('live-1')
    expect(j.orchestrations[0].children.map((t: { task_id: string }) => t.task_id)).toEqual(['done-1'])
    expect(j.orchestrations[0].open_count).toBe(1) // the finished step is not open
  })

  it('reads the archive scoped to the tenant, the window and the row cap', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] })
    await GET(req('limit=500&done_days=7'))
    expect(queryMock).toHaveBeenCalledTimes(2)
    const [sql, values] = queryMock.mock.calls[1]
    expect(sql).toContain('cerveau.agent_tasks_archive')
    expect(sql).toContain('tenant_id = $1')
    expect(values).toEqual(['u1', 7, 100]) // cap of 100 decoded rows even when limit=500
  })

  it('passes agent_type to the archive query and clamps done_days to the 40-day retention', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] })
    await GET(req('agent_type=leads_qualifier&done_days=999'))
    const [sql, values] = queryMock.mock.calls[1]
    expect(sql).toContain('agent_type = $2')
    expect(values).toEqual(['u1', 'leads_qualifier', 40, 100])
  })

  it('applies session_id to archived tasks (the archive table has no session column)', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [archived({ task_id: 'a', session_id: 'room-1' }), archived({ task_id: 'b', session_id: 'room-2' })],
      })
    const j = await (await GET(req('session_id=room-2'))).json()
    expect(j.tasks.map((t: { task_id: string }) => t.task_id)).toEqual(['b'])
  })

  it("drops an archive row that belongs to another tenant even if it reached the result", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [archived({ tenant_id: 'someone-else' })] })
    const j = await (await GET(req())).json()
    expect(j.counts.total).toBe(0)
  })

  it('ignores a corrupt archive row and still serves the rest', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ payload: Buffer.from('garbage') }, archived()] })
    const j = await (await GET(req())).json()
    expect(j.columns.done).toHaveLength(1)
  })

  it('serves the live board when the archive cannot be read (dev DB, older Cerveau)', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [liveRow()] })
      .mockRejectedValueOnce(new Error('relation "cerveau.agent_tasks_archive" does not exist'))
    const res = await GET(req())
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.counts).toMatchObject({ in_progress: 1, done: 0, total: 1 })
  })

  it('does not touch the archive when another column is requested', async () => {
    queryMock.mockResolvedValueOnce({ rows: [liveRow({ status: 'todo' })] })
    const j = await (await GET(req('status=todo'))).json()
    expect(queryMock).toHaveBeenCalledTimes(1)
    expect(j.counts.done).toBe(0)
  })

  it('reads the archive for status=done, and keeps a legacy done row still in the live table', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [liveRow({ task_id: 'legacy', status: 'done', updated_at: iso(10_000) })] })
      .mockResolvedValueOnce({ rows: [archived()] })
    const j = await (await GET(req('status=done'))).json()
    expect(queryMock).toHaveBeenCalledTimes(2)
    expect(j.columns.done.map((t: { task_id: string }) => t.task_id).sort()).toEqual(['done-1', 'legacy'])
  })

  it('the live copy wins if a task is caught mid-move', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [liveRow({ task_id: 'same', status: 'in_progress' })] })
      .mockResolvedValueOnce({ rows: [archived({ task_id: 'same' })] })
    const j = await (await GET(req())).json()
    expect(j.counts.total).toBe(1)
    expect(j.tasks[0].status).toBe('in_progress')
  })

  it('never lists a cancelled live row, and never lets an archive row be cancelled', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [liveRow({ task_id: 'stopped', status: 'cancelled' })] })
      .mockResolvedValueOnce({ rows: [archived({ status: 'cancelled' })] })
    const j = await (await GET(req())).json()
    expect(j.tasks.map((t: { task_id: string }) => t.task_id)).toEqual(['done-1'])
    expect(j.tasks[0].status).toBe('done')
  })

  it('is still tenant-scoped for a user session: no tenant_id can be chosen by the caller', async () => {
    const res = await GET(new NextRequest('http://x/api/aira/tasks', { headers: {} }))
    expect(res.status).toBe(401)
    expect(queryMock).not.toHaveBeenCalled()
  })
})
