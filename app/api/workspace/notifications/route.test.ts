/**
 * Route-level tests for the notifications inbox (Fase 4b): unread mentions
 * scoped by read gates, agent identity required for service, mark-read.
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

import { GET, POST } from './route'

process.env.COLLAB_SERVICE_TOKEN = 'test-service-token'

const svcAgent = { 'x-service-token': 'test-service-token', 'x-agent-type': 'leads_qualifier' }
const svcNoAgent = { 'x-service-token': 'test-service-token' }

const MENTION = {
  id: 7,
  workspace_id: 'default',
  doc_id: 'doc-1',
  row_id: 'r0',
  actor_type: 'user',
  actor_id: 'owner-1',
  actor_name: 'owner@aivory.id',
  mentioned_kind: 'agent',
  mentioned_id: 'leads_qualifier',
  source: 'comment',
  excerpt: '@lex please take this',
  created_at: new Date().toISOString(),
}

beforeEach(() => {
  queryMock.mockReset()
  queryMock.mockImplementation((sql: string) => {
    if (sql.includes('FROM dashboard.workspace_mention_reads')) {
      return Promise.resolve({ rows: [] })
    }
    if (sql.includes('FROM dashboard.workspace_mentions')) {
      return Promise.resolve({ rows: [MENTION] })
    }
    if (sql.includes('FROM dashboard.workspace_agent_acl')) {
      return Promise.resolve({ rows: [{ role: 'editor' }] })
    }
    return Promise.resolve({ rows: [], rowCount: 1 })
  })
})

describe('GET /api/workspace/notifications', () => {
  it('returns unread mentions for the asserted agent', async () => {
    const res = await GET(new NextRequest('http://localhost/api/workspace/notifications', { headers: svcAgent }))
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.unread).toBe(1)
    expect(j.mentions[0]).toMatchObject({ doc_id: 'doc-1', mentioned_id: 'leads_qualifier' })
  })

  it('requires an agent identity for service callers', async () => {
    const res = await GET(new NextRequest('http://localhost/api/workspace/notifications', { headers: svcNoAgent }))
    expect(res.status).toBe(400)
  })

  it('advances the watermark on markRead', async () => {
    const res = await POST(
      new NextRequest('http://localhost/api/workspace/notifications', {
        method: 'POST',
        body: JSON.stringify({ markRead: true }),
        headers: { 'Content-Type': 'application/json', ...svcAgent },
      }),
    )
    expect(res.status).toBe(200)
    const upsert = queryMock.mock.calls.find((c) => String(c[0]).includes('workspace_mention_reads'))
    expect(upsert).toBeTruthy()
  })
})
