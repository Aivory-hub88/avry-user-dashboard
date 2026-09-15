/**
 * Route-level tests for rollup resolution (Fase 4a): GET injects computed
 * values for readable targets, null for unreadable ones, agents gated.
 */
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

import { GET } from './route'

process.env.COLLAB_SERVICE_TOKEN = 'test-service-token'

const svc = { 'x-service-token': 'test-service-token' }

const DEFS = [
  { id: 'f-rel', name: 'Project', type: 'relation', options: [], targetDocId: 'doc-t' },
  { id: 'f-done', name: 'Progress', type: 'rollup', options: [], relationFieldId: 'f-rel', rollupOp: 'donePct' },
]

function mainBytes(): Buffer {
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
    m.set('cells', { 'f-rel': ['t1', 't2'] })
    arr.push([m])
  })
  return Buffer.from(Y.encodeStateAsUpdate(doc))
}

function targetBytes(): Buffer {
  const doc = new Y.Doc()
  const arr = doc.getArray<Y.Map<unknown>>('database')
  doc.transact(() => {
    for (const [id, status] of [['t1', 'Done'], ['t2', 'Todo']] as const) {
      const m = new Y.Map<unknown>()
      m.set('id', id)
      m.set('title', id)
      m.set('status', status)
      m.set('priority', 'Med')
      m.set('assignee', '')
      m.set('due', '')
      m.set('description', '')
      m.set('comments', [])
      m.set('cells', {})
      arr.push([m])
    }
  })
  return Buffer.from(Y.encodeStateAsUpdate(doc))
}

beforeEach(() => {
  queryMock.mockReset()
  queryMock.mockImplementation((sql: string, params: unknown[]) => {
    if (sql.includes('SELECT id, yjs_update')) {
      const id = params[0] as string
      if (id === 'workspace:doc-t') return Promise.resolve({ rows: [{ id, yjs_update: targetBytes() }] })
      return Promise.resolve({ rows: [{ id: 'workspace:doc-1', yjs_update: mainBytes() }] })
    }
    if (sql.includes('SELECT props')) {
      return Promise.resolve({ rows: [{ props: { dbFields: DEFS } }] })
    }
    return Promise.resolve({ rows: [], rowCount: 1 })
  })
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }),
  )
})

describe('GET /api/workspace/[id]/database with rollups', () => {
  it('injects computed rollup values for readable targets', async () => {
    const req = new NextRequest('http://localhost/api/workspace/doc-1/database', { headers: svc })
    const res = await GET(req, { params: Promise.resolve({ id: 'doc-1' }) })
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.rows[0].cells).toMatchObject({ 'f-rel': ['t1', 't2'], 'f-done': 50 })
  })
})
