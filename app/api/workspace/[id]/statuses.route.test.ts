/** Room PATCH: props.dbStatuses validation + "My tasks" index re-stamp (Tasks P2 item 13). */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }))
vi.mock('@/lib/db', () => ({ query: queryMock }))
vi.mock('@/lib/serverAuth', () => ({ getAuthUserWithToken: () => null }))
vi.mock('@/lib/workspaceAccess', async (orig) => ({
  ...(await orig<typeof import('@/lib/workspaceAccess')>()),
  getDocRole: async () => 'owner',
}))

import { PATCH } from './route'

process.env.COLLAB_SERVICE_TOKEN = 'test-service-token'
const svc = { 'x-service-token': 'test-service-token', 'Content-Type': 'application/json' }
const params = { params: Promise.resolve({ id: 'doc-1' }) }
const patch = (props: unknown) =>
  PATCH(new NextRequest('http://localhost/api/workspace/doc-1', { method: 'PATCH', body: JSON.stringify({ props }), headers: svc }), params)

beforeEach(() => {
  queryMock.mockReset()
  queryMock.mockImplementation((sql: string, values: unknown[]) =>
    sql.includes('UPDATE dashboard.workspace_docs')
      ? Promise.resolve({ rows: [{ props: JSON.parse(String(values[1])) }] })
      : Promise.resolve({ rows: [], rowCount: 0 }),
  )
})

const restamps = () => queryMock.mock.calls.filter(([sql]) => String(sql).includes('SET status_group'))

describe('PATCH props.dbStatuses', () => {
  it('stores a valid list grouped in order and re-stamps the task index', async () => {
    const res = await patch({
      dbStatuses: [
        { name: 'Shipped', group: 'done' },
        { name: 'Backlog', group: 'todo' },
        { name: 'Review', group: 'in_progress' },
      ],
    })
    expect(res.status).toBe(200)
    expect((await res.json()).props.dbStatuses.map((s: { name: string }) => s.name)).toEqual(['Backlog', 'Review', 'Shipped'])
    expect(restamps()).toHaveLength(1)
    expect(restamps()[0][1][0]).toBe('doc-1')
  })

  it('refuses a list without a done status (400 with a reason)', async () => {
    const res = await patch({ dbStatuses: [{ name: 'Open', group: 'todo' }] })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid props.dbStatuses', reason: 'no_done' })
    expect(restamps()).toHaveLength(0)
  })

  it('validates automations sent in the same patch against the new statuses', async () => {
    const res = await patch({
      dbStatuses: [{ name: 'Open', group: 'todo' }, { name: 'Closed', group: 'done' }],
      dbAutomations: [
        { id: 'a', name: 'Thanks', whenStatus: 'Closed', addComment: 'thanks' },
        { id: 'b', name: 'Stale', whenStatus: 'Done', addComment: 'x' },
      ],
    })
    expect((await res.json()).props.dbAutomations.map((r: { id: string }) => r.id)).toEqual(['a'])
  })

  it('leaves the index alone when statuses are not part of the patch', async () => {
    await patch({ dbWip: { Review: 3 } })
    expect(restamps()).toHaveLength(0)
  })
})
