/** REST create/PATCH: people newly named on a task (assignees, owner, person cells) must be room members / invited agents. */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import * as Y from 'yjs'

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }))
vi.mock('@/lib/db', () => ({
  query: queryMock,
  withTransaction: async (fn: (tx: (sql: string) => Promise<{ rows: unknown[] }>) => Promise<unknown>) =>
    fn(async (sql: string) =>
      sql.includes('INSERT INTO dashboard.workspace_events') ? { rows: [{ id: 1, created_at: '2026-01-01 00:00:00+00', payload: '{}' }] } : { rows: [] },
    ),
}))
vi.mock('@/lib/serverAuth', () => ({ getAuthUserWithToken: () => null }))

import { POST } from './route'
import { PATCH } from './[rowId]/route'

process.env.COLLAB_SERVICE_TOKEN = 'test-service-token'
const svc = { 'x-service-token': 'test-service-token', 'Content-Type': 'application/json' }
const DEFS = [{ id: 'f-rev', name: 'Reviewer', type: 'person', options: [] }]

// The row already holds people who are NOT in the room any more (legacy data).
function stored(): Buffer {
  const doc = new Y.Doc()
  doc.transact(() => {
    const m = new Y.Map<unknown>()
    m.set('id', 'r0')
    m.set('title', 'Card')
    m.set('status', 'Todo')
    m.set('priority', 'Med')
    m.set('assignee', 'Gone Gary')
    m.set('assignees', [{ kind: 'user', id: 'u-gone', name: 'Gone Gary' }])
    m.set('owner', { kind: 'user', id: 'u-gone', name: 'Gone Gary' })
    m.set('cells', { 'f-rev': [{ kind: 'user', id: 'u-gone' }] })
    doc.getArray<Y.Map<unknown>>('database').push([m])
  })
  return Buffer.from(Y.encodeStateAsUpdate(doc))
}

beforeEach(() => {
  queryMock.mockReset()
  queryMock.mockImplementation((sql: string) => {
    if (sql.includes('SELECT owner, workspace_id')) return Promise.resolve({ rows: [{ owner: 'u-own', workspace_id: 'team-1' }] })
    if (sql.includes('SELECT user_id FROM dashboard.workspace_doc_acl')) return Promise.resolve({ rows: [{ user_id: 'u-acl' }] })
    if (sql.includes('SELECT user_id FROM dashboard.workspace_members')) return Promise.resolve({ rows: [{ user_id: 'u-team' }] })
    if (sql.includes('SELECT agent_type FROM dashboard.workspace_agent_acl')) return Promise.resolve({ rows: [{ agent_type: 'autonomous' }] })
    if (sql.includes('SELECT id, yjs_update')) return Promise.resolve({ rows: [{ id: 'workspace:doc-1', yjs_update: stored() }] })
    if (sql.includes('SELECT props')) return Promise.resolve({ rows: [{ props: { dbFields: DEFS } }] })
    return Promise.resolve({ rows: [], rowCount: 1 })
  })
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((_url: string, init?: { method?: string }) =>
      init?.method === 'PUT' ? Promise.resolve({ ok: true, status: 200 }) : Promise.resolve({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }),
    ),
  )
})

const post = (body: unknown) =>
  POST(new NextRequest('http://localhost/api/workspace/doc-1/database', { method: 'POST', body: JSON.stringify(body), headers: svc }), { params: Promise.resolve({ id: 'doc-1' }) })
const patch = (body: unknown) =>
  PATCH(new NextRequest('http://localhost/api/workspace/doc-1/database/r0', { method: 'PATCH', body: JSON.stringify(body), headers: svc }), {
    params: Promise.resolve({ id: 'doc-1', rowId: 'r0' }),
  })

const stranger = { kind: 'user', id: 'u-nobody' }

describe('POST create', () => {
  it('rejects an assignee who is not a member', async () => {
    const res = await post({ title: 't', assignees: [{ kind: 'user', id: 'u-team' }, stranger] })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid assignees', reason: 'not_member', person: 'user:u-nobody' })
  })
  it('rejects an agent that is not invited (typed and legacy text)', async () => {
    const typed = await post({ title: 't', assignees: [{ kind: 'agent', type: 'leads_qualifier' }] })
    expect(typed.status).toBe(400)
    expect((await typed.json()).person).toBe('agent:leads_qualifier')
    expect((await post({ title: 't', assignee: 'leads_qualifier' })).status).toBe(400)
  })
  it('rejects a non-member in a person cell and names the field', async () => {
    const res = await post({ title: 't', cells: { 'f-rev': [stranger] } })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid cells', field: 'f-rev', reason: 'not_member', person: 'user:u-nobody' })
  })
  it('rejects a non-member owner', async () => {
    const res = await post({ title: 't', owner: stranger })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid owner')
  })
  it('accepts owner, ACL grants, team members and invited agents', async () => {
    const res = await post({
      title: 't',
      owner: { kind: 'user', id: 'u-own' },
      assignees: [{ kind: 'user', id: 'u-acl' }, { kind: 'agent', type: 'autonomous' }],
      cells: { 'f-rev': [{ kind: 'user', id: 'u-team' }] },
    })
    expect(res.status).toBe(201)
  })
  it('does not query the roster when nobody is named', async () => {
    expect((await post({ title: 't' })).status).toBe(201)
    expect(queryMock.mock.calls.some((c) => String(c[0]).includes('workspace_agent_acl'))).toBe(false)
  })
})

describe('PATCH', () => {
  it('rejects a newly added non-member assignee / cell / owner', async () => {
    expect((await patch({ assignees: [{ kind: 'user', id: 'u-gone' }, stranger] })).status).toBe(400)
    const cell = await patch({ cells: { 'f-rev': [stranger] } })
    expect(cell.status).toBe(400)
    expect((await cell.json()).field).toBe('f-rev')
    expect((await patch({ owner: stranger })).status).toBe(400)
  })
  it('lets unrelated writes through even though the row holds people who left', async () => {
    expect((await patch({ title: 'renamed' })).status).toBe(200)
    expect((await patch({ priority: 'High', cells: {} })).status).toBe(200)
  })
  it('re-sending people already on the row is not "adding" them', async () => {
    const res = await patch({
      assignees: [{ kind: 'user', id: 'u-gone', name: 'Gone Gary' }],
      owner: { kind: 'user', id: 'u-gone' },
      cells: { 'f-rev': [{ kind: 'user', id: 'u-gone' }] },
    })
    expect(res.status).toBe(200)
  })
  it('accepts adding a member', async () => {
    expect((await patch({ assignees: [{ kind: 'user', id: 'u-gone' }, { kind: 'user', id: 'u-team' }] })).status).toBe(200)
  })
})
