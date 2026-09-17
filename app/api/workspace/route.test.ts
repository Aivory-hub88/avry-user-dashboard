/**
 * Route-level tests for the workspace list (cursor pagination): default page
 * carries no cursor when the raw fetch came up short, a full raw page yields
 * an opaque nextCursor, and that cursor round-trips into the next query's
 * WHERE clause unchanged.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

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

import { GET } from './route'

process.env.COLLAB_SERVICE_TOKEN = 'test-service-token'

const svc = { 'x-service-token': 'test-service-token' }

function docRow(id: string, updatedAt: string) {
  return { id, workspace_id: 'default', owner: 'owner-1', title: id, mode: 'page', favorite: false, deleted_at: null, updated_at: updatedAt, bytes: 0 }
}

beforeEach(() => {
  queryMock.mockReset()
})

describe('GET /api/workspace (list pagination)', () => {
  it('omits nextCursor when the raw fetch came up short of the padded limit', async () => {
    // limit defaults to 100 -> rawLimit 120; returning fewer rows than that
    // means the table is exhausted for this filter, so no more pages.
    queryMock.mockImplementation((sql: string) => {
      if (sql.includes('FROM dashboard.workspace_docs') && sql.includes('octet_length')) {
        return Promise.resolve({ rows: [docRow('doc-1', '2026-01-01T00:00:00Z')] })
      }
      return Promise.resolve({ rows: [{ id: 'doc-1', owner: 'owner-1', workspace_id: 'default' }] })
    })
    const req = new NextRequest('http://localhost/api/workspace', { headers: svc })
    const res = await GET(req)
    const j = await res.json()
    expect(j.nextCursor).toBeNull()
    expect(j.docs).toHaveLength(1)
  })

  it('returns an opaque nextCursor when the raw fetch fills the padded limit', async () => {
    queryMock.mockImplementation((sql: string) => {
      if (sql.includes('FROM dashboard.workspace_docs') && sql.includes('octet_length')) {
        // rawLimit for the default page (limit=100) is 120 — return exactly that many.
        const rows = Array.from({ length: 120 }, (_, i) => docRow(`doc-${i}`, `2026-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`))
        return Promise.resolve({ rows })
      }
      return Promise.resolve({
        rows: Array.from({ length: 120 }, (_, i) => ({ id: `doc-${i}`, owner: 'owner-1', workspace_id: 'default' })),
      })
    })
    const req = new NextRequest('http://localhost/api/workspace', { headers: svc })
    const res = await GET(req)
    const j = await res.json()
    expect(typeof j.nextCursor).toBe('string')
    expect(j.docs.length).toBeLessThanOrEqual(100)
  })

  it('round-trips a cursor into the next query as a composite WHERE clause', async () => {
    queryMock.mockResolvedValue({ rows: [] })
    const cursor = Buffer.from(JSON.stringify({ u: '2026-01-01T00:00:00Z', id: 'doc-50' })).toString('base64url')
    const req = new NextRequest(`http://localhost/api/workspace?cursor=${encodeURIComponent(cursor)}`, { headers: svc })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const [sql, params] = queryMock.mock.calls[0]
    expect(String(sql)).toContain('(updated_at, id) < ($1::timestamptz, $2)')
    expect(params).toEqual(['2026-01-01T00:00:00Z', 'doc-50', 120])
  })

  it('ignores a malformed cursor rather than 500ing', async () => {
    queryMock.mockResolvedValue({ rows: [] })
    const req = new NextRequest('http://localhost/api/workspace?cursor=not-valid-base64%20json', { headers: svc })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const [sql] = queryMock.mock.calls[0]
    expect(String(sql)).not.toContain('updated_at, id) <')
  })
})
