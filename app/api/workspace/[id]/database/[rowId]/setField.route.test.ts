/**
 * Automation "set person field": moving a card into a status puts the owner /
 * creator / a chosen person into a person field — replaces on a single field,
 * dedupes on a multi one, notifies ("set you as …") and rides REST create too.
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
import { POST as createPOST } from '../route'
import { rosterResult } from '@/lib/testRoster'

process.env.COLLAB_SERVICE_TOKEN = 'test-service-token'
const svc = { 'x-service-token': 'test-service-token', 'Content-Type': 'application/json' }

const FIELDS = [
  { id: 'rev', name: 'Reviewer', type: 'person', options: [] },
  { id: 'qa', name: 'QA', type: 'person', options: [], single: true },
]
let rules: unknown[] = []

function build(): Buffer {
  const doc = new Y.Doc()
  const arr = doc.getArray<Y.Map<unknown>>('database')
  doc.transact(() => {
    const m = new Y.Map<unknown>()
    for (const [k, v] of Object.entries({
      id: 't', title: 'Ship it', status: 'Todo', priority: 'Med', assignee: '', due: '', description: '', comments: [],
      owner: { kind: 'user', id: 'u-own', name: 'Olive' },
      createdBy: { kind: 'user', id: 'u-cre', name: 'Cleo' },
      cells: { qa: [{ kind: 'user', id: 'u-old', name: 'Old' }] },
    })) m.set(k, v)
    arr.push([m])
  })
  return Buffer.from(Y.encodeStateAsUpdate(doc))
}
const stored = build()

beforeEach(() => {
  queryMock.mockReset()
  queryMock.mockImplementation((sql: string) => {
    const roster = rosterResult(sql)
    if (roster) return Promise.resolve(roster)
    if (sql.includes('SELECT id, yjs_update')) return Promise.resolve({ rows: [{ id: 'workspace:doc-1', yjs_update: stored }] })
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

const notices = () =>
  queryMock.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO dashboard.workspace_mentions') && String(sql).includes("'field_assigned'"))
const noticeArgs = () => {
  const p = notices()[0][1] as unknown[]
  return { ids: p[7], excerpts: p[8] }
}
function savedRow(id: string): Record<string, unknown> {
  const call = [...queryMock.mock.calls].reverse().find(([sql]) => String(sql).includes('INSERT INTO dashboard.workspace_docs'))
  if (!call) throw new Error('nothing saved')
  const doc = new Y.Doc()
  Y.applyUpdate(doc, new Uint8Array((call[1] as unknown[])[1] as Buffer))
  return doc.getArray<Y.Map<unknown>>('database').toArray().find((m) => m.get('id') === id)!.toJSON()
}

describe('move into a status runs setField', () => {
  it('puts the owner in the Reviewer field and notifies them', async () => {
    rules = [{ id: 'a1', name: 'Rev', whenStatus: 'Doing', setField: { fieldId: 'rev', to: 'owner' } }]
    const res = await move('Doing')
    expect(res.status).toBe(200)
    const cells = savedRow('t').cells as Record<string, unknown>
    expect(cells.rev).toEqual([{ kind: 'user', id: 'u-own', name: 'Olive' }])
    expect(cells.qa).toEqual([{ kind: 'user', id: 'u-old', name: 'Old' }])
    expect(notices()).toHaveLength(1)
    expect(noticeArgs()).toEqual({ ids: ['u-own'], excerpts: ['Reviewer\nShip it'] })
    const j = await res.json()
    expect(j.automated[0].setField.fieldName).toBe('Reviewer')
  })

  it('replaces the person of a single-person field (creator)', async () => {
    rules = [{ id: 'a2', name: 'QA', whenStatus: 'Doing', setField: { fieldId: 'qa', to: 'creator' } }]
    await move('Doing')
    expect((savedRow('t').cells as Record<string, unknown>).qa).toEqual([{ kind: 'user', id: 'u-cre', name: 'Cleo' }])
  })

  it('two rules on one entry never double up the same person, one notice each', async () => {
    rules = [
      { id: 'a3', name: 'One', whenStatus: 'Doing', setField: { fieldId: 'rev', to: 'owner' } },
      { id: 'a4', name: 'Two', whenStatus: 'Doing', setField: { fieldId: 'rev', to: 'user:u-own' } },
    ]
    await move('Doing')
    expect((savedRow('t').cells as Record<string, unknown>).rev).toHaveLength(1)
    expect(notices()).toHaveLength(1)
    expect((notices()[0][1] as unknown[])[7]).toEqual(['u-own'])
  })

  it('does nothing for a rule whose field was deleted', async () => {
    rules = [{ id: 'a5', name: 'Gone', whenStatus: 'Doing', setField: { fieldId: 'gone', to: 'owner' }, addComment: 'hi' }]
    const res = await move('Doing')
    expect(res.status).toBe(200)
    expect(notices()).toHaveLength(0)
    expect((savedRow('t').cells as Record<string, unknown>).gone).toBeUndefined()
  })
})

describe('PATCH status + single field', () => {
  it('a status patch triggers setField and notifies even without cells in the patch', async () => {
    rules = [{ id: 'a6', name: 'Rev', whenStatus: 'Doing', setField: { fieldId: 'rev', to: 'owner' } }]
    const res = await PATCH(new NextRequest('http://localhost/api/workspace/doc-1/database/t', { method: 'PATCH', body: JSON.stringify({ status: 'Doing' }), headers: svc }), paramsFor('t'))
    expect(res.status).toBe(200)
    expect(notices()).toHaveLength(1)
  })

  it('rejects a second person on a single field with too_many', async () => {
    rules = []
    const res = await PATCH(
      new NextRequest('http://localhost/api/workspace/doc-1/database/t', { method: 'PATCH', body: JSON.stringify({ cells: { qa: ['user:a', 'user:b'] } }), headers: svc }),
      paramsFor('t'),
    )
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid cells', field: 'qa', reason: 'too_many' })
    const ok = await PATCH(
      new NextRequest('http://localhost/api/workspace/doc-1/database/t', { method: 'PATCH', body: JSON.stringify({ cells: { rev: ['user:a', 'user:b'] } }), headers: svc }),
      paramsFor('t'),
    )
    expect(ok.status).toBe(200)
  })
})

describe('REST create into an automated status', () => {
  it('creator-targeted rule fills the field of a new task (service caller: no creator → skipped)', async () => {
    rules = [{ id: 'a7', name: 'Rev', whenStatus: 'Doing', setField: { fieldId: 'rev', to: 'user:u-z' } }]
    const res = await createPOST(
      new NextRequest('http://localhost/api/workspace/doc-1/database', { method: 'POST', body: JSON.stringify({ title: 'New', status: 'Doing' }), headers: svc }),
      { params: Promise.resolve({ id: 'doc-1' }) },
    )
    expect(res.status).toBe(201)
    const row = (await res.json()).row
    expect(row.cells.rev).toEqual([{ kind: 'user', id: 'u-z' }])
    expect(notices()).toHaveLength(1)
  })
})
