/**
 * Route-level tests for agent revoke (Fase 1 Opsi C). DB mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

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

import { DELETE } from './route'

process.env.COLLAB_SERVICE_TOKEN = 'test-service-token'

const svc = { 'x-service-token': 'test-service-token' }

function delReq(type: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`http://localhost/api/workspace/doc-1/agents/${type}`, {
    method: 'DELETE',
    headers,
  })
}

beforeEach(() => {
  queryMock.mockReset()
  queryMock.mockResolvedValue({ rows: [], rowCount: 1 })
})

describe('DELETE /api/workspace/[id]/agents/[agentType]', () => {
  it('returns 401 with no credential', async () => {
    const res = await DELETE(delReq('leads_qualifier'), {
      params: Promise.resolve({ id: 'doc-1', agentType: 'leads_qualifier' }),
    })
    expect(res.status).toBe(401)
  })

  it('rejects unknown agentType with 400', async () => {
    const res = await DELETE(delReq('clippy', svc), {
      params: Promise.resolve({ id: 'doc-1', agentType: 'clippy' }),
    })
    expect(res.status).toBe(400)
  })

  it('revokes a known agent', async () => {
    const res = await DELETE(delReq('leads_qualifier', svc), {
      params: Promise.resolve({ id: 'doc-1', agentType: 'leads_qualifier' }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true })
    const del = queryMock.mock.calls.find((c) =>
      String(c[0]).includes('DELETE FROM dashboard.workspace_agent_acl'),
    )
    expect(del).toBeTruthy()
    expect(del?.[1]).toEqual(['doc-1', 'leads_qualifier'])
  })
})
