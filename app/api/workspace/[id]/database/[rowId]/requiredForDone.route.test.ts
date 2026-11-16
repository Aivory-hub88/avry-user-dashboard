/**
 * "Required before Done" fields: a soft rule. Moving (REST move / PATCH status)
 * into a done-group status while a required cell is empty succeeds but answers
 * `warning: "required_fields"` + `missingFields`, mirroring `warning: "blocked"`.
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

import { POST as movePOST } from './move/route'
import { PATCH } from './route'

process.env.COLLAB_SERVICE_TOKEN = 'test-service-token'
const svc = { 'x-service-token': 'test-service-token', 'Content-Type': 'application/json' }

const FIELDS = [
  { id: 'rev', name: 'Reviewer', type: 'person', options: [], requiredForDone: true },
  { id: 'pr', name: 'PR link', type: 'url', options: [], requiredForDone: true },
  { id: 'note', name: 'Note', type: 'text', options: [] },
]
const rules: unknown[] = []
let cellsNow: Record<string, unknown> = {}

function build(): Buffer {
  const doc = new Y.Doc()
  const arr = doc.getArray<Y.Map<unknown>>('database')
  doc.transact(() => {
    const m = new Y.Map<unknown>()
    for (const [k, v] of Object.entries({
      id: 't', title: 'Ship it', status: 'Todo', priority: 'Med', assignee: '', due: '', description: '', comments: [],
      owner: { kind: 'user', id: 'u-own', name: 'Olive' },
      createdBy: { kind: 'user', id: 'u-cre', name: 'Cleo' },
      cells: cellsNow,
    })) m.set(k, v)
    arr.push([m])
  })
  return Buffer.from(Y.encodeStateAsUpdate(doc))
}

beforeEach(() => {
  queryMock.mockReset()
  queryMock.mockImplementation((sql: string) => {
    if (sql.includes('SELECT id, yjs_update')) return Promise.resolve({ rows: [{ id: 'workspace:doc-1', yjs_update: build() }] })
    if (sql.includes('SELECT props')) return Promise.resolve({ rows: [{ props: { dbFields: FIELDS, dbAutomations: rules } }] })
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
const move = (status: string) =>
  movePOST(new NextRequest('http://localhost/api/workspace/doc-1/database/t/move', { method: 'POST', body: JSON.stringify({ status }), headers: svc }), paramsFor('t'))
const patch = (body: unknown) =>
  PATCH(new NextRequest('http://localhost/api/workspace/doc-1/database/t', { method: 'PATCH', body: JSON.stringify(body), headers: svc }), paramsFor('t'))

describe('move into Done with required fields empty', () => {
  it('moves anyway and lists the empty required fields', async () => {
    cellsNow = { note: 'x' }
    const res = await move('Done')
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.moved).toBe(true)
    expect(j.warning).toBe('required_fields')
    expect(j.missingFields).toEqual([{ id: 'rev', name: 'Reviewer' }, { id: 'pr', name: 'PR link' }])
  })

  it('only lists what is still empty', async () => {
    cellsNow = { rev: [{ kind: 'user', id: 'u1', name: 'Una' }] }
    const j = await (await move('Done')).json()
    expect(j.missingFields).toEqual([{ id: 'pr', name: 'PR link' }])
  })

  it('no warning when every required field is filled', async () => {
    cellsNow = { rev: [{ kind: 'user', id: 'u1', name: 'Una' }], pr: 'https://x.test/1' }
    const j = await (await move('Done')).json()
    expect(j.warning).toBeUndefined()
    expect(j.missingFields).toBeUndefined()
  })

  it('no warning for a status outside the done group', async () => {
    cellsNow = {}
    const j = await (await move('Doing')).json()
    expect(j.moved).toBe(true)
    expect(j.warning).toBeUndefined()
  })
})

describe('PATCH status into Done', () => {
  it('warns like move does, and a blank (whitespace) url still counts as empty', async () => {
    cellsNow = { pr: '   ' }
    const res = await patch({ status: 'Done' })
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.warning).toBe('required_fields')
    expect(j.missingFields.map((f: { id: string }) => f.id)).toEqual(['rev', 'pr'])
  })

  it('counts cells filled in the same patch', async () => {
    cellsNow = {}
    const j = await (await patch({ status: 'Done', cells: { rev: [{ kind: 'user', id: 'u1' }], pr: 'https://x.test/1' } })).json()
    expect(j.warning).toBeUndefined()
  })

  it('a patch that does not change status never warns', async () => {
    cellsNow = {}
    const j = await (await patch({ priority: 'High' })).json()
    expect(j.warning).toBeUndefined()
  })
})
