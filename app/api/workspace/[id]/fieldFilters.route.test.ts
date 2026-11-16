/** Room PATCH: person fields + saved views keep per-field person filters (Tasks P2 item 14). */
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

describe('PATCH person fields + views', () => {
  it('stores a person field definition', async () => {
    const res = await patch({ dbFields: [{ id: 'f-rev', name: 'Reviewer', type: 'person', options: ['ignored'] }] })
    expect(res.status).toBe(200)
    expect((await res.json()).props.dbFields).toEqual([{ id: 'f-rev', name: 'Reviewer', type: 'person', options: [] }])
  })

  it('keeps valid per-field person filters in saved views and drops junk', async () => {
    const res = await patch({
      dbViews: [
        { id: 'v1', name: 'My reviews', kind: 'table', fieldFilters: { 'f-rev': 'me', 'f-qa': 'All', 'f-x': 'agent:nope' } },
        { id: 'v2', name: 'Plain', kind: 'table' },
      ],
    })
    expect(res.status).toBe(200)
    const views = (await res.json()).props.dbViews
    expect(views[0].fieldFilters).toEqual({ 'f-rev': 'me' })
    expect(views[1]).not.toHaveProperty('fieldFilters')
  })
})
