/**
 * Tasks P1: followers + their notices, comment mentions by user id, and the
 * UI event endpoint that reports Yjs edits after the fact.
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

import { POST as eventsPOST } from './route'
import { PATCH } from '../route'
import { POST as commentsPOST } from '../comments/route'
import { POST as movePOST } from '../move/route'

process.env.COLLAB_SERVICE_TOKEN = 'test-service-token'
const svc = { 'x-service-token': 'test-service-token', 'Content-Type': 'application/json' }

const follower = { kind: 'user', id: 'u-f', name: 'Fia' }
let commentAt = new Date().toISOString()

function dbBytes(): Buffer {
  const doc = new Y.Doc()
  const arr = doc.getArray<Y.Map<unknown>>('database')
  doc.transact(() => {
    const m = new Y.Map<unknown>()
    for (const [k, v] of Object.entries({
      id: 'rf',
      title: 'Ship it',
      status: 'Doing',
      priority: 'Med',
      assignee: '',
      due: '2026-11-20',
      description: '',
      followers: [follower],
      createdAt: new Date().toISOString(),
      comments: [
        { id: 'c-agent', text: 'done soon', author: 'autonomous', at: commentAt, authorRef: { kind: 'agent', type: 'autonomous' } },
        { id: 'c-other', text: 'not mine', author: 'x', at: commentAt, authorRef: { kind: 'user', id: 'someone' } },
      ],
    })) m.set(k, v)
    arr.push([m])
  })
  return Buffer.from(Y.encodeStateAsUpdate(doc))
}

beforeEach(() => {
  commentAt = new Date().toISOString()
  queryMock.mockReset()
  queryMock.mockImplementation((sql: string) => {
    if (sql.includes('SELECT id, yjs_update')) return Promise.resolve({ rows: [{ id: 'workspace:doc-1', yjs_update: dbBytes() }] })
    if (sql.includes('SELECT props')) return Promise.resolve({ rows: [{ props: {} }] })
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

const params = { params: Promise.resolve({ id: 'doc-1', rowId: 'rf' }) }
const req = (path: string, body: unknown, method = 'POST', headers: Record<string, string> = svc) =>
  new NextRequest(`http://localhost/api/workspace/doc-1/database/rf${path}`, { method, body: JSON.stringify(body), headers })

/** Inbox inserts of one source, as [sql, params]. */
const notices = (source: string) =>
  queryMock.mock.calls.filter(
    ([sql, p]) => String(sql).includes('INSERT INTO dashboard.workspace_mentions') && (String(sql).includes(`'${source}'`) || (Array.isArray(p) && p.includes(source))),
  )
const activity = (action: string) =>
  queryMock.mock.calls.filter(([sql, p]) => String(sql).includes('workspace_activity') && Array.isArray(p) && p.includes(action))

describe('followers on PATCH / move', () => {
  it('status → Done notifies followers (not the actor) and logs the change', async () => {
    const res = await PATCH(req('', { status: 'Done' }, 'PATCH'), params)
    expect(res.status).toBe(200)
    const done = notices('status_done')
    expect(done).toHaveLength(1)
    expect((done[0][1] as unknown[]).at(-1)).toEqual(['u-f'])
    expect(activity('database.status_changed')).toHaveLength(1)
    expect(activity('database.row_updated')).toHaveLength(0)
  })

  it('due change notifies followers', async () => {
    await PATCH(req('', { due: '2026-11-25' }, 'PATCH'), params)
    expect(notices('due_changed')).toHaveLength(1)
    expect(activity('database.due_changed')).toHaveLength(1)
  })

  it('a new owner starts following', async () => {
    const res = await PATCH(req('', { owner: { kind: 'user', id: 'u-o', name: 'Oki' } }, 'PATCH'), params)
    expect(res.status).toBe(200)
    expect(activity('database.owner_changed')).toHaveLength(1)
  })

  it('move to Done notifies followers', async () => {
    const res = await movePOST(req('/move', { status: 'Done' }), params)
    expect(res.status).toBe(200)
    expect(notices('status_done')).toHaveLength(1)
  })
})

describe('comments: mentions by id + followers', () => {
  it('mentions a member by id and skips them in the follower notice', async () => {
    const res = await commentsPOST(req('/comments', { text: 'hey [@Fia](#member:u-f) and [@Budi](#member:u-b)' }), params)
    expect(res.status).toBe(201)
    const j = await res.json()
    expect(j.comment.mentions).toEqual([{ kind: 'user', id: 'u-f' }, { kind: 'user', id: 'u-b' }])
    const mention = notices('comment')
    expect(mention).toHaveLength(1)
    expect((mention[0][1] as unknown[]).at(-1)).toEqual(['u-f', 'u-b'])
    // u-f follows but was mentioned: one notice, not two.
    expect(notices('commented')).toHaveLength(0)
  })

  it('tells followers about a plain comment', async () => {
    await commentsPOST(req('/comments', { text: 'looks good' }), params)
    const c = notices('commented')
    expect(c).toHaveLength(1)
    expect((c[0][1] as unknown[]).at(-1)).toEqual(['u-f'])
  })
})

describe('POST /events (UI reports)', () => {
  const agentHeaders = { ...svc, 'x-agent-type': 'autonomous' }

  it('400 for an unknown kind', async () => {
    expect((await eventsPOST(req('/events', { kind: 'nope' }), params)).status).toBe(400)
  })

  it('records a verified status change', async () => {
    const res = await eventsPOST(req('/events', { kind: 'status', from: 'Todo' }), params)
    expect(res.status).toBe(200)
    expect(activity('database.status_changed')).toHaveLength(1)
    // Doing isn't Done: no follower notice.
    expect(notices('status_done')).toHaveLength(0)
  })

  it('records a UI-created task', async () => {
    expect((await eventsPOST(req('/events', { kind: 'created' }), params)).status).toBe(200)
    expect(activity('database.row_created')).toHaveLength(1)
  })

  it('reports the caller’s own recent comment to followers', async () => {
    const res = await eventsPOST(req('/events', { kind: 'comment', commentId: 'c-agent' }, 'POST', agentHeaders), params)
    expect(res.status).toBe(200)
    expect(notices('commented')).toHaveLength(1)
  })

  it('409 for a claim the row does not back (after one re-check)', async () => {
    const res = await eventsPOST(req('/events', { kind: 'due', from: '2026-11-20' }), params)
    expect(res.status).toBe(409)
    expect(notices('due_changed')).toHaveLength(0)
  }, 5000)

  it('409 for someone else’s comment', async () => {
    const res = await eventsPOST(req('/events', { kind: 'comment', commentId: 'c-other' }, 'POST', agentHeaders), params)
    expect(res.status).toBe(409)
  }, 5000)
})
