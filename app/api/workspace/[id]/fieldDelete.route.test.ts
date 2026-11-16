/** Room PATCH: deleting a custom field also deletes its row values, saved-view filters/sorts and automation actions. */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import * as Y from 'yjs'

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }))
vi.mock('@/lib/db', () => ({ query: queryMock, withTransaction: async (fn: (tx: () => Promise<{ rows: unknown[] }>) => Promise<unknown>) => fn(async () => ({ rows: [] })) }))
vi.mock('@/lib/serverAuth', () => ({ getAuthUserWithToken: () => null }))
vi.mock('@/lib/workspaceAccess', async (orig) => ({
  ...(await orig<typeof import('@/lib/workspaceAccess')>()),
  getDocRole: async () => 'owner',
}))

import { PATCH } from './route'

process.env.COLLAB_SERVICE_TOKEN = 'test-service-token'
const svc = { 'x-service-token': 'test-service-token', 'Content-Type': 'application/json' }
const params = { params: Promise.resolve({ id: 'doc-1' }) }

const FIELDS = [
  { id: 'f-rev', name: 'Reviewer', type: 'person', options: [] },
  { id: 'f-team', name: 'Team', type: 'select', options: ['A'] },
]
const VIEWS = [{ id: 'v1', name: 'Mine', kind: 'table', sortField: 'field:f-rev', fieldFilters: { 'f-rev': 'me', 'f-team': 'A' } }]
const RULES = [
  { id: 'r1', name: 'Review on Doing', whenStatus: 'Doing', setField: { fieldId: 'f-rev', to: 'owner' } },
  { id: 'r2', name: 'Both', whenStatus: 'Done', addComment: 'ok', setField: { fieldId: 'f-rev', to: 'owner' } },
  { id: 'r3', name: 'Other', whenStatus: 'Doing', addComment: 'hi' },
]

function stored(): Buffer {
  const doc = new Y.Doc()
  doc.transact(() => {
    for (const [id, cells] of [
      ['a', { 'f-rev': [{ kind: 'user', id: 'u-1' }], 'f-team': 'A' }],
      ['b', { 'f-team': 'A' }],
      ['c', {}],
    ] as const) {
      const m = new Y.Map<unknown>()
      m.set('id', id)
      m.set('title', id)
      m.set('status', 'Todo')
      m.set('cells', cells)
      doc.getArray<Y.Map<unknown>>('database').push([m])
    }
  })
  return Buffer.from(Y.encodeStateAsUpdate(doc))
}

// One stored state per test: re-encoding would give each read a new Yjs client id, and the
// merge in saveDbDoc would then resolve the `cells` conflict by that random id.
let storedBytes: Buffer = stored()
let upserts: Buffer[] = []
let propsUpdate: Record<string, unknown> | null = null

beforeEach(() => {
  storedBytes = stored()
  upserts = []
  propsUpdate = null
  queryMock.mockReset()
  queryMock.mockImplementation((sql: string, values: unknown[]) => {
    if (sql.includes('UPDATE dashboard.workspace_docs')) {
      propsUpdate = JSON.parse(String(values[1]))
      return Promise.resolve({ rows: [{ props: propsUpdate }] })
    }
    if (sql.includes('SELECT props')) return Promise.resolve({ rows: [{ props: { dbFields: FIELDS, dbViews: VIEWS, dbAutomations: RULES } }] })
    if (sql.includes('SELECT id, yjs_update')) return Promise.resolve({ rows: [{ id: 'workspace:doc-1', yjs_update: storedBytes }] })
    if (sql.includes('INSERT INTO dashboard.workspace_docs')) {
      upserts.push(values[1] as Buffer)
      return Promise.resolve({ rows: [], rowCount: 1 })
    }
    return Promise.resolve({ rows: [], rowCount: 0 })
  })
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((_url: string, init?: { method?: string }) =>
      init?.method === 'PUT' ? Promise.resolve({ ok: true, status: 200 }) : Promise.resolve({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }),
    ),
  )
})

const patch = (props: unknown) =>
  PATCH(new NextRequest('http://localhost/api/workspace/doc-1', { method: 'PATCH', body: JSON.stringify({ props }), headers: svc }), params)

function savedCells(): Record<string, Record<string, unknown>> {
  const doc = new Y.Doc()
  Y.applyUpdate(doc, new Uint8Array(upserts[upserts.length - 1]))
  const out: Record<string, Record<string, unknown>> = {}
  for (const m of doc.getArray<Y.Map<unknown>>('database').toArray()) out[m.get('id') as string] = m.get('cells') as Record<string, unknown>
  return out
}

describe('PATCH props.dbFields — deleting a field', () => {
  it('drops its values from every row, keeps the other fields', async () => {
    const res = await patch({ dbFields: [FIELDS[1]] })
    expect(res.status).toBe(200)
    expect(savedCells()).toEqual({ a: { 'f-team': 'A' }, b: { 'f-team': 'A' }, c: {} })
  })

  it('cleans saved views and automation rules in the same patch', async () => {
    await patch({ dbFields: [FIELDS[1]] })
    expect(propsUpdate?.dbViews).toEqual([{ id: 'v1', name: 'Mine', kind: 'table', sortField: 'title', fieldFilters: { 'f-team': 'A' } }])
    expect(propsUpdate?.dbAutomations).toEqual([{ id: 'r2', name: 'Both', whenStatus: 'Done', addComment: 'ok' }, RULES[2]])
  })

  it('cleans the views/rules sent in the same patch too', async () => {
    await patch({ dbFields: [FIELDS[1]], dbViews: VIEWS })
    expect((propsUpdate?.dbViews as Array<{ sortField: string }>)[0].sortField).toBe('title')
  })

  it('does nothing extra when no field is removed (no purge, no view/rule rewrite)', async () => {
    const res = await patch({ dbFields: [...FIELDS, { id: 'f-new', name: 'New', type: 'text', options: [] }] })
    expect(res.status).toBe(200)
    expect(upserts).toHaveLength(0)
    expect(propsUpdate).not.toHaveProperty('dbViews')
    expect(propsUpdate).not.toHaveProperty('dbAutomations')
  })

  it('purges only the removed field key (removing the select keeps the person values)', async () => {
    const res = await patch({ dbFields: [FIELDS[0]] }) // removes f-team: only 'a' and 'b' hold it → they change
    expect(res.status).toBe(200)
    expect(savedCells().a).toEqual({ 'f-rev': [{ kind: 'user', id: 'u-1' }] })
  })
})
