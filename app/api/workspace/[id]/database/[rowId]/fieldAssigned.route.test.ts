/**
 * "X set you as Reviewer on <task>": the 'field_assigned' inbox notice when
 * people are newly set on a person field — REST create, REST PATCH and the
 * UI's events report. No self-notify, only people newly added, followers added.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import * as Y from 'yjs'

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }))

vi.mock('@/lib/db', () => ({
  query: queryMock,
  withTransaction: async (fn: (tx: (sql: string) => Promise<{ rows: unknown[] }>) => Promise<unknown>) =>
    fn(async (sql: string) =>
      sql.includes('INSERT INTO dashboard.workspace_events')
        ? { rows: [{ id: 1, created_at: '2026-01-01 00:00:00+00', payload: '{}' }] }
        : { rows: [] },
    ),
}))

vi.mock('@/lib/serverAuth', () => ({ getAuthUserWithToken: () => null }))

import { PATCH } from './route'
import { POST as createPOST } from '../route'
import { POST as eventsPOST } from './events/route'

process.env.COLLAB_SERVICE_TOKEN = 'test-service-token'
const svc = { 'x-service-token': 'test-service-token', 'Content-Type': 'application/json' }

const FIELDS = [
  { id: 'rev', name: 'Reviewer', type: 'person', options: [] },
  { id: 'note', name: 'Note', type: 'text', options: [] },
]

function build(): Buffer {
  const doc = new Y.Doc()
  const arr = doc.getArray<Y.Map<unknown>>('database')
  const rows: Array<Record<string, unknown>> = [
    { id: 't', title: 'Ship it', status: 'Todo', cells: { rev: [{ kind: 'user', id: 'u-a', name: 'Ann' }] } },
    { id: 'e', title: 'Empty', status: 'Todo' },
  ]
  doc.transact(() => {
    for (const r of rows) {
      const m = new Y.Map<unknown>()
      for (const [k, v] of Object.entries({ priority: 'Med', assignee: '', due: '', description: '', ...r })) m.set(k, v)
      arr.push([m])
    }
  })
  return Buffer.from(Y.encodeStateAsUpdate(doc))
}
const stored = build()

beforeEach(() => {
  queryMock.mockReset()
  queryMock.mockImplementation((sql: string) => {
    if (sql.includes('SELECT id, yjs_update')) return Promise.resolve({ rows: [{ id: 'workspace:doc-1', yjs_update: stored }] })
    if (sql.includes('SELECT props')) return Promise.resolve({ rows: [{ props: { dbFields: FIELDS } }] })
    if (sql.includes('SELECT workspace_id')) return Promise.resolve({ rows: [] })
    if (sql.includes('workspace_agent_acl')) return Promise.resolve({ rows: [{ role: 'editor' }] })
    return Promise.resolve({ rows: [], rowCount: 1 })
  })
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((_url: string, init?: { method?: string }) =>
      init?.method === 'PUT'
        ? Promise.resolve({ ok: true, status: 200 })
        : Promise.resolve({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }),
    ),
  )
})

const paramsFor = (rowId: string) => ({ params: Promise.resolve({ id: 'doc-1', rowId }) })
const req = (rowId: string, path: string, body: unknown, method = 'POST') =>
  new NextRequest(`http://localhost/api/workspace/doc-1/database/${rowId}${path}`, { method, body: JSON.stringify(body), headers: svc })

const notices = () =>
  queryMock.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO dashboard.workspace_mentions') && String(sql).includes("'field_assigned'"))
/** [kinds, ids, excerpts] of the one notice insert. */
const noticeArgs = () => {
  const p = notices()[0][1] as unknown[]
  return { kinds: p[6], ids: p[7], excerpts: p[8] }
}

function savedRow(id: string): Record<string, unknown> {
  const call = [...queryMock.mock.calls].reverse().find(([sql]) => String(sql).includes('INSERT INTO dashboard.workspace_docs'))
  if (!call) throw new Error('nothing saved')
  const doc = new Y.Doc()
  Y.applyUpdate(doc, new Uint8Array((call[1] as unknown[])[1] as Buffer))
  return doc.getArray<Y.Map<unknown>>('database').toArray().find((m) => m.get('id') === id)!.toJSON()
}

describe('PATCH cells', () => {
  it('notifies only the people newly set, and makes them followers', async () => {
    const res = await PATCH(req('t', '', { cells: { rev: ['user:u-a', 'user:u-b', 'agent:autonomous'] } }, 'PATCH'), paramsFor('t'))
    expect(res.status).toBe(200)
    expect(notices()).toHaveLength(1)
    const a = noticeArgs()
    expect(a.kinds).toEqual(['user', 'agent'])
    expect(a.ids).toEqual(['u-b', 'autonomous'])
    expect(a.excerpts).toEqual(['Reviewer\nShip it', 'Reviewer\nShip it'])
    const followers = (savedRow('t').followers as Array<{ id?: string; type?: string }>).map((f) => f.id ?? f.type)
    expect(followers).toEqual(expect.arrayContaining(['u-b', 'autonomous']))
  })

  it('stays silent when nobody new was set (same people, removal, non-person field)', async () => {
    await PATCH(req('t', '', { cells: { rev: ['user:u-a'] } }, 'PATCH'), paramsFor('t'))
    await PATCH(req('t', '', { cells: { rev: [] } }, 'PATCH'), paramsFor('t'))
    await PATCH(req('t', '', { cells: { note: 'hello' } }, 'PATCH'), paramsFor('t'))
    expect(notices()).toHaveLength(0)
  })

  it('never notifies the actor about themself', async () => {
    // A service call's actor is agent:<X-Agent-Type> (default "user").
    await PATCH(req('t', '', { cells: { rev: ['agent:user'] } }, 'PATCH'), paramsFor('t'))
    expect(notices()).toHaveLength(0)
  })
})

describe('REST create', () => {
  it('notifies the people set on a person field of a new task', async () => {
    const res = await createPOST(
      new NextRequest('http://localhost/api/workspace/doc-1/database', {
        method: 'POST',
        body: JSON.stringify({ title: 'Brand new', cells: { rev: ['user:u-c'] } }),
        headers: svc,
      }),
      { params: Promise.resolve({ id: 'doc-1' }) },
    )
    expect(res.status).toBe(201)
    expect(notices()).toHaveLength(1)
    const a = noticeArgs()
    expect(a.ids).toEqual(['u-c'])
    expect(a.excerpts).toEqual(['Reviewer\nBrand new'])
  })
})

describe('UI events report', () => {
  it('notifies people really in the stored cell and not in `from`', async () => {
    // The stored row has u-a; the client says the field was empty before.
    const res = await eventsPOST(req('t', '/events', { kind: 'field', fieldId: 'rev', from: [] }), paramsFor('t'))
    expect(res.status).toBe(200)
    expect(noticeArgs().ids).toEqual(['u-a'])
    expect(noticeArgs().excerpts).toEqual(['Reviewer\nShip it'])
  })

  it('refuses a claim the stored row does not back up', async () => {
    const res = await eventsPOST(req('t', '/events', { kind: 'field', fieldId: 'rev', from: ['user:u-a'] }), paramsFor('t'))
    expect(res.status).toBe(409)
    expect(notices()).toHaveLength(0)
  }, 10_000)

  it('refuses a claim for a field that is not a person field', async () => {
    const res = await eventsPOST(req('t', '/events', { kind: 'field', fieldId: 'note', from: [] }), paramsFor('t'))
    expect(res.status).toBe(409)
    expect(notices()).toHaveLength(0)
  }, 10_000)
})
