/** Route-level tests for person custom-field cells (Tasks P2 item 14). */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import * as Y from 'yjs'

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }))

vi.mock('@/lib/db', () => ({
  query: queryMock,
  // recordWorkspaceEvent's audit-log writes (dual-written alongside
  // recordWorkspaceActivity / recordCommentMentions) run through
  // withTransaction. This gives it a minimal, self-contained tx so route
  // tests don't need to model the event log's own queries in their
  // `queryMock` branching — without it, withTransaction is undefined and
  // recordWorkspaceEvent's own try/catch silently swallows the failure,
  // which is harmless but prints noise on every write-path test.
  withTransaction: async (fn: (tx: (sql: string) => Promise<{ rows: unknown[] }>) => Promise<unknown>) =>
    fn(async (sql: string) =>
      sql.includes('INSERT INTO dashboard.workspace_events')
        ? { rows: [{ id: 1, created_at: '2026-01-01 00:00:00+00', payload: '{}' }] }
        : { rows: [] },
    ),
}))

vi.mock('@/lib/serverAuth', () => ({ getAuthUserWithToken: () => null }))

import { POST } from './route'
import { PATCH } from './[rowId]/route'
import { rosterResult } from '@/lib/testRoster'

process.env.COLLAB_SERVICE_TOKEN = 'test-service-token'

const svc = { 'x-service-token': 'test-service-token' }
const DEFS = [
  { id: "f-rev", name: "Reviewer", type: "person", options: [] },
  { id: 'f-team', name: 'Team', type: 'select', options: ['A', 'B'] },
  { id: 'f-tags', name: 'Tags', type: 'multi', options: ['x', 'y'] },
]

function dbBytes(): Buffer {
  const doc = new Y.Doc()
  const arr = doc.getArray<Y.Map<unknown>>('database')
  doc.transact(() => {
    const m = new Y.Map<unknown>()
    m.set('id', 'r0')
    m.set('title', 'Card')
    m.set('status', 'Todo')
    m.set('priority', 'Med')
    m.set('assignee', '')
    m.set('due', '')
    m.set('description', '')
    m.set('comments', [])
    m.set('cells', { 'f-team': 'A' })
    arr.push([m])
  })
  return Buffer.from(Y.encodeStateAsUpdate(doc))
}

beforeEach(() => {
  queryMock.mockReset()
  queryMock.mockImplementation((sql: string) => {
    const roster = rosterResult(sql)
    if (roster) return Promise.resolve(roster)
    if (sql.includes('SELECT id, yjs_update')) {
      return Promise.resolve({ rows: [{ id: 'workspace:doc-1', yjs_update: dbBytes() }] })
    }
    if (sql.includes('SELECT props')) {
      return Promise.resolve({ rows: [{ props: { dbFields: DEFS } }] })
    }
    if (sql.includes('SELECT workspace_id')) {
      return Promise.resolve({ rows: [] })
    }
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

describe('person cells REST', () => {
  const post = (cells: unknown) =>
    POST(
      new NextRequest('http://localhost/api/workspace/doc-1/database', {
        method: 'POST',
        body: JSON.stringify({ title: 'Needs review', cells }),
        headers: { 'Content-Type': 'application/json', ...svc },
      }),
      { params: Promise.resolve({ id: 'doc-1' }) },
    )
  const patch = (cells: unknown) =>
    PATCH(
      new NextRequest('http://localhost/api/workspace/doc-1/database/r0', {
        method: 'PATCH',
        body: JSON.stringify({ cells }),
        headers: { 'Content-Type': 'application/json', ...svc },
      }),
      { params: Promise.resolve({ id: 'doc-1', rowId: 'r0' }) },
    )

  it('POST stores refs and keys as refs', async () => {
    const res = await post({ 'f-rev': [{ kind: 'user', id: 'u-1', name: 'Ann' }, 'agent:autonomous'] })
    expect(res.status).toBe(201)
    expect((await res.json()).row.cells['f-rev']).toEqual([
      { kind: 'user', id: 'u-1', name: 'Ann' },
      { kind: 'agent', type: 'autonomous' },
    ])
  })

  it('POST rejects a bad person cell with 400', async () => {
    const res = await post({ 'f-rev': 'Ann' })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid cells', field: 'f-rev', reason: 'shape' })
  })

  it('PATCH sets a reviewer without touching other cells', async () => {
    const res = await patch({ 'f-rev': ['user:u-2'] })
    expect(res.status).toBe(200)
    expect((await res.json()).cells).toEqual({ 'f-team': 'A', 'f-rev': [{ kind: 'user', id: 'u-2' }] })
  })

  it('PATCH rejects too many people and unknown agents', async () => {
    const six = Array.from({ length: 6 }, (_, i) => 'user:u' + i)
    expect((await patch({ 'f-rev': six })).status).toBe(400)
    const res = await patch({ 'f-rev': [{ kind: 'agent', type: 'nope' }] })
    expect(res.status).toBe(400)
    expect((await res.json()).reason).toBe('shape')
  })
})
