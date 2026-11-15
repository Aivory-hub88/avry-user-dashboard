/**
 * Tasks P2 item 13: custom statuses with groups through REST create / PATCH
 * / move and the UI events endpoint. The room here names its own statuses:
 * Backlog (todo) · Building, Review (in progress) · Shipped (done) · Won't do (canceled).
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
import { GET as listGET, POST as createPOST } from '../route'
import { POST as movePOST } from './move/route'
import { POST as eventsPOST } from './events/route'

process.env.COLLAB_SERVICE_TOKEN = 'test-service-token'
const svc = { 'x-service-token': 'test-service-token', 'Content-Type': 'application/json' }

const ROOM_STATUSES = [
  { name: 'Backlog', group: 'todo' },
  { name: 'Building', group: 'in_progress' },
  { name: 'Review', group: 'in_progress' },
  { name: 'Shipped', group: 'done' },
  { name: "Won't do", group: 'canceled' },
]
let props: Record<string, unknown> = {}
let blkStatus = 'Review'
const cache = new Map<string, Buffer>()
function dbBytes(): Buffer {
  const hit = cache.get(blkStatus)
  if (hit) return hit
  const doc = new Y.Doc()
  const arr = doc.getArray<Y.Map<unknown>>('database')
  const rows: Array<Record<string, unknown>> = [
    {
      id: 'blk',
      title: 'Fix pricing',
      status: blkStatus,
      followers: [{ kind: 'user', id: 'u-f' }],
    },
    {
      id: 't',
      title: 'Announce',
      status: 'Backlog',
      blockedBy: ['blk'],
      assignees: [{ kind: 'user', id: 'u-a' }],
      owner: { kind: 'user', id: 'u-o' },
    },
  ]
  doc.transact(() => {
    for (const r of rows) {
      const m = new Y.Map<unknown>()
      for (const [k, v] of Object.entries({ priority: 'Med', assignee: '', due: '', description: '', ...r })) m.set(k, v)
      arr.push([m])
    }
  })
  const b = Buffer.from(Y.encodeStateAsUpdate(doc))
  cache.set(blkStatus, b)
  return b
}

beforeEach(() => {
  blkStatus = 'Review'
  props = { dbStatuses: ROOM_STATUSES }
  queryMock.mockReset()
  queryMock.mockImplementation((sql: string) => {
    if (sql.includes('SELECT id, yjs_update')) return Promise.resolve({ rows: [{ id: 'workspace:doc-1', yjs_update: dbBytes() }] })
    if (sql.includes('SELECT props')) return Promise.resolve({ rows: [{ props }] })
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
const docParams = { params: Promise.resolve({ id: 'doc-1' }) }
const req = (path: string, body: unknown, method = 'POST') =>
  new NextRequest(`http://localhost/api/workspace/doc-1/database${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: svc,
  })

function savedRows(): Map<string, Record<string, unknown>> {
  const call = [...queryMock.mock.calls].reverse().find(([sql]) => String(sql).includes('INSERT INTO dashboard.workspace_docs'))
  if (!call) throw new Error('nothing saved')
  const doc = new Y.Doc()
  Y.applyUpdate(doc, new Uint8Array((call[1] as unknown[])[1] as Buffer))
  const out = new Map<string, Record<string, unknown>>()
  for (const m of doc.getArray<Y.Map<unknown>>('database').toArray()) out.set(m.get('id') as string, m.toJSON())
  return out
}

const notices = (source: string) =>
  queryMock.mock.calls.filter(([sql, params]) => {
    if (!String(sql).includes('INSERT INTO dashboard.workspace_mentions')) return false
    return String(sql).includes(`'${source}'`) || (Array.isArray(params) && params.includes(source))
  })

describe('create', () => {
  it("starts in the room's first to-do status when none is given", async () => {
    const res = await createPOST(req('', { title: 'New' }), docParams)
    expect(res.status).toBe(201)
    const created = [...savedRows().values()].find((r) => r.title === 'New')
    expect(created?.status).toBe('Backlog')
  })

  it('maps legacy names and any case onto the room', async () => {
    await createPOST(req('', { title: 'Old client', status: 'Done' }), docParams)
    expect([...savedRows().values()].find((r) => r.title === 'Old client')?.status).toBe('Shipped')
    await createPOST(req('', { title: 'Lower', status: 'review' }), docParams)
    expect([...savedRows().values()].find((r) => r.title === 'Lower')?.status).toBe('Review')
  })

  it('rejects a status the room does not have', async () => {
    const res = await createPOST(req('', { title: 'X', status: 'Archived' }), docParams)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid status', statuses: ROOM_STATUSES.map((s) => s.name) })
  })

  it("lists the room's statuses with the rows", async () => {
    const res = await listGET(req('', undefined, 'GET'), docParams)
    expect((await res.json()).statuses).toEqual(ROOM_STATUSES)
  })
})

describe('PATCH status', () => {
  it('rejects an unknown status, accepts a custom one', async () => {
    expect((await PATCH(req('/t', { status: 'Archived' }, 'PATCH'), paramsFor('t'))).status).toBe(400)
    const res = await PATCH(req('/t', { status: "won't do" }, 'PATCH'), paramsFor('t'))
    expect(res.status).toBe(200)
    expect(savedRows().get('t')?.status).toBe("Won't do")
  })

  it('warns when a blocked task enters ANY in-progress status', async () => {
    const res = await PATCH(req('/t', { status: 'Building' }, 'PATCH'), paramsFor('t'))
    const body = await res.json()
    expect(body.warning).toBe('blocked')
    expect(body.blockedBy.map((b: { id: string }) => b.id)).toEqual(['blk'])
  })

  it('a done-group status tells followers and frees blocked tasks', async () => {
    const res = await PATCH(req('/blk', { status: 'Shipped' }, 'PATCH'), paramsFor('blk'))
    expect(res.status).toBe(200)
    expect(notices('status_done')).toHaveLength(1)
    expect(notices('unblocked')).toHaveLength(1)
  })

  it('canceling a blocker frees blocked tasks but is not a "done" notice', async () => {
    await PATCH(req('/blk', { status: "Won't do" }, 'PATCH'), paramsFor('blk'))
    expect(notices('status_done')).toHaveLength(0)
    expect(notices('unblocked')).toHaveLength(1)
  })
})

describe('move', () => {
  it('moves into a custom done status with the same notices', async () => {
    const res = await movePOST(req('/blk/move', { status: 'Shipped' }), paramsFor('blk'))
    expect((await res.json()).moved).toBe(true)
    expect(notices('status_done')).toHaveLength(1)
    expect(notices('unblocked')).toHaveLength(1)
  })

  it('rejects an unknown status and warns on a blocked in-progress move', async () => {
    expect((await movePOST(req('/t/move', { status: 'Nope' }), paramsFor('t'))).status).toBe(400)
    const body = await (await movePOST(req('/t/move', { status: 'Review' }), paramsFor('t'))).json()
    expect(body.warning).toBe('blocked')
  })

  it('a room without custom statuses keeps Todo / Doing / Done', async () => {
    props = {}
    const res = await movePOST(req('/t/move', { status: 'Doing' }), paramsFor('t'))
    expect(res.status).toBe(200)
    expect(savedRows().get('t')?.status).toBe('Doing')
  })
})

describe('events endpoint (UI writes through Yjs)', () => {
  it('a verified move into a done-group status notifies followers', async () => {
    blkStatus = 'Shipped'
    const res = await eventsPOST(req('/blk/events', { kind: 'status', from: 'Review' }), paramsFor('blk'))
    expect(res.status).toBe(200)
    expect(notices('status_done')).toHaveLength(1)
    expect(notices('unblocked')).toHaveLength(1)
  })
})
