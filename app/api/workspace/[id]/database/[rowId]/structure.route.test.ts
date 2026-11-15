/**
 * Tasks P2: sub-tasks (`parentId`) and dependencies (`blockedBy`) through
 * REST create / PATCH / DELETE / move, and the 'unblocked' inbox notice
 * (PATCH, move and the UI events endpoint).
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

import { PATCH, DELETE } from './route'
import { POST as createPOST } from '../route'
import { POST as movePOST } from './move/route'
import { POST as eventsPOST } from './events/route'

process.env.COLLAB_SERVICE_TOKEN = 'test-service-token'
const svc = { 'x-service-token': 'test-service-token', 'Content-Type': 'application/json' }

let blkStatus = 'Doing'
// One stored state per status: the save path merges pg into the doc, so a
// fresh Y.Doc (new client id) per read would duplicate every row.
const cache = new Map<string, Buffer>()
function dbBytes(): Buffer {
  const hit = cache.get(blkStatus)
  if (hit) return hit
  const b = build()
  cache.set(blkStatus, b)
  return b
}

function build(): Buffer {
  const doc = new Y.Doc()
  const arr = doc.getArray<Y.Map<unknown>>('database')
  const rows: Array<Record<string, unknown>> = [
    { id: 'p', title: 'Launch', status: 'Doing' },
    { id: 'c1', title: 'Outline', status: 'Done', parentId: 'p' },
    { id: 'c2', title: 'Review', status: 'Todo', parentId: 'p' },
    { id: 'blk', title: 'Fix pricing', status: blkStatus },
    {
      id: 't',
      title: 'Announce',
      status: 'Todo',
      blockedBy: ['blk'],
      assignees: [{ kind: 'user', id: 'u-a' }, { kind: 'agent', type: 'autonomous' }],
      owner: { kind: 'user', id: 'u-o' },
    },
    { id: 't2', title: 'Blog', status: 'Todo', blockedBy: ['blk', 'other'], owner: { kind: 'user', id: 'u-o' } },
    { id: 'other', title: 'Other', status: 'Todo' },
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

beforeEach(() => {
  blkStatus = 'Doing'
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

const paramsFor = (rowId: string) => ({ params: Promise.resolve({ id: 'doc-1', rowId }) })
const req = (rowId: string, path: string, body: unknown, method = 'POST') =>
  new NextRequest(`http://localhost/api/workspace/doc-1/database/${rowId}${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: svc,
  })

/** Rows as last written to pg (id → plain object). */
function savedRows(): Map<string, Record<string, unknown>> {
  const call = [...queryMock.mock.calls].reverse().find(([sql]) => String(sql).includes('INSERT INTO dashboard.workspace_docs'))
  if (!call) throw new Error('nothing saved')
  const doc = new Y.Doc()
  Y.applyUpdate(doc, new Uint8Array((call[1] as unknown[])[1] as Buffer))
  const out = new Map<string, Record<string, unknown>>()
  for (const m of doc.getArray<Y.Map<unknown>>('database').toArray()) out.set(m.get('id') as string, m.toJSON())
  return out
}

const unblocked = () =>
  queryMock.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO dashboard.workspace_mentions') && String(sql).includes("'unblocked'"))

describe('PATCH parentId / blockedBy', () => {
  it('stores a valid blocker list', async () => {
    const res = await PATCH(req('t', '', { blockedBy: ['blk', 'other'] }, 'PATCH'), paramsFor('t'))
    expect(res.status).toBe(200)
    expect((await res.json()).patched.blockedBy).toEqual(['blk', 'other'])
    expect(savedRows().get('t')?.blockedBy).toEqual(['blk', 'other'])
  })

  it.each([
    [['t'], 'self'],
    [['nope'], 'missing'],
    [Array.from({ length: 21 }, (_, i) => `r${i}`), 'too_many'],
  ])('rejects blockedBy %j (%s)', async (blockedBy, reason) => {
    const res = await PATCH(req('t', '', { blockedBy }, 'PATCH'), paramsFor('t'))
    expect(res.status).toBe(400)
    expect((await res.json()).reason).toBe(reason)
  })

  it('rejects a dependency cycle', async () => {
    const res = await PATCH(req('blk', '', { blockedBy: ['t'] }, 'PATCH'), paramsFor('blk'))
    expect(res.status).toBe(400)
    expect((await res.json()).reason).toBe('cycle')
  })

  it('sets and clears a parent', async () => {
    expect((await PATCH(req('other', '', { parentId: 'p' }, 'PATCH'), paramsFor('other'))).status).toBe(200)
    expect(savedRows().get('other')?.parentId).toBe('p')
    expect((await PATCH(req('c1', '', { parentId: null }, 'PATCH'), paramsFor('c1'))).status).toBe(200)
    expect(savedRows().get('c1')?.parentId).toBeNull()
  })

  it.each([
    ['other', 'other', 'self'],
    ['other', 'nope', 'missing'],
    ['other', 'c1', 'nested'],
    ['p', 'other', 'has_subtasks'],
    ['p', 'c2', 'cycle'],
  ])('rejects %s → parent %s (%s)', async (rowId, parentId, reason) => {
    const res = await PATCH(req(rowId, '', { parentId }, 'PATCH'), paramsFor(rowId))
    expect(res.status).toBe(400)
    expect((await res.json()).reason).toBe(reason)
  })

  it('moving a blocked task to Doing works but warns', async () => {
    const res = await PATCH(req('t', '', { status: 'Doing' }, 'PATCH'), paramsFor('t'))
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.warning).toBe('blocked')
    expect(j.blockedBy).toEqual([{ id: 'blk', title: 'Fix pricing', status: 'Doing' }])
  })
})

describe('POST create with structure', () => {
  const create = (body: unknown) =>
    createPOST(new NextRequest('http://localhost/api/workspace/doc-1/database', { method: 'POST', body: JSON.stringify(body), headers: svc }), {
      params: Promise.resolve({ id: 'doc-1' }),
    })

  it('creates a sub-task that waits on a blocker', async () => {
    const res = await create({ title: 'Proofread', parentId: 'p', blockedBy: ['blk'] })
    expect(res.status).toBe(201)
    const j = await res.json()
    expect(j.row).toMatchObject({ parentId: 'p', blockedBy: ['blk'] })
    expect(savedRows().get(j.id)).toMatchObject({ parentId: 'p', blockedBy: ['blk'] })
  })

  it('rejects an unknown or nested parent and unknown blockers', async () => {
    expect((await create({ title: 'x', parentId: 'nope' })).status).toBe(400)
    expect((await create({ title: 'x', parentId: 'c1' })).status).toBe(400)
    expect((await create({ title: 'x', blockedBy: ['nope'] })).status).toBe(400)
  })

  it('legacy create (no keys) = top level, no blockers', async () => {
    const j = await (await create({ title: 'plain' })).json()
    expect(j.row).toMatchObject({ parentId: null, blockedBy: [] })
  })
})

describe('unblocked notices', () => {
  it('PATCH blocker → Done tells the freed task’s assignees + owner', async () => {
    const res = await PATCH(req('blk', '', { status: 'Done' }, 'PATCH'), paramsFor('blk'))
    expect(res.status).toBe(200)
    const n = unblocked()
    expect(n).toHaveLength(1)
    const p = n[0][1] as unknown[]
    expect(p[2]).toBe('t') // the unblocked task, not t2 (still waits on "other")
    expect(p.at(-2)).toEqual(['user', 'agent', 'user'])
    expect(p.at(-1)).toEqual(['u-a', 'autonomous', 'u-o'])
  })

  it('move blocker → Done does the same', async () => {
    expect((await movePOST(req('blk', '/move', { status: 'Done' }), paramsFor('blk'))).status).toBe(200)
    expect(unblocked()).toHaveLength(1)
  })

  it('move a blocked task → Doing warns', async () => {
    const j = await (await movePOST(req('t', '/move', { status: 'Doing' }), paramsFor('t'))).json()
    expect(j.moved).toBe(true)
    expect(j.warning).toBe('blocked')
  })

  it('UI status report (events) unblocks too', async () => {
    blkStatus = 'Done'
    const res = await eventsPOST(req('blk', '/events', { kind: 'status', from: 'Doing' }), paramsFor('blk'))
    expect(res.status).toBe(200)
    expect(unblocked()).toHaveLength(1)
  })

  it('no notice for a move that isn’t into Done', async () => {
    await PATCH(req('blk', '', { status: 'Todo' }, 'PATCH'), paramsFor('blk'))
    expect(unblocked()).toHaveLength(0)
  })
})

describe('DELETE a parent', () => {
  it('keeps sub-tasks as top-level tasks by default', async () => {
    const res = await DELETE(req('p', '', undefined, 'DELETE'), paramsFor('p'))
    expect(res.status).toBe(200)
    expect((await res.json()).deleted).toEqual(['p'])
    const rows = savedRows()
    expect(rows.has('p')).toBe(false)
    expect(rows.get('c1')?.parentId).toBeNull()
    expect(rows.get('c2')?.parentId).toBeNull()
  })

  it('?subtasks=delete removes them too', async () => {
    const res = await DELETE(req('p', '?subtasks=delete', undefined, 'DELETE'), paramsFor('p'))
    expect((await res.json()).deleted.sort()).toEqual(['c1', 'c2', 'p'])
    const rows = savedRows()
    expect(['p', 'c1', 'c2'].some((id) => rows.has(id))).toBe(false)
    expect(rows.has('t')).toBe(true)
  })

  it('a deleted blocker leaves the blocked lists', async () => {
    await DELETE(req('blk', '', undefined, 'DELETE'), paramsFor('blk'))
    const rows = savedRows()
    expect(rows.get('t')?.blockedBy).toEqual([])
    expect(rows.get('t2')?.blockedBy).toEqual(['other'])
  })
})
