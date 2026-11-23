/**
 * Seat enforcement on POST /api/workspaces/[id]/members. DB and auth mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { queryMock, cred } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  cred: { current: null as null | { kind: 'user'; token: string; user: { user_id: string; account_type: string } } },
}))

vi.mock('@/lib/db', () => ({ query: queryMock }))
vi.mock('@/lib/workspaceAuth', () => ({
  workspacePlanDenied: async () => null,
  workspaceCredential: () => cred.current,
  unauthorized: () => new Response(null, { status: 401 }),
  forbidden: () => new Response(null, { status: 403 }),
}))

const { emailMock } = vi.hoisted(() => ({ emailMock: vi.fn() }))
vi.mock('@/lib/workspaceInviteEmail', () => ({ sendInviteEmail: emailMock }))

import { POST } from './route'

interface Db {
  tier: string | null
  seatLimit?: number | null
  members: number
  targetSeated?: boolean
}

function db({ tier, seatLimit = null, members, targetSeated = false }: Db) {
  queryMock.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM dashboard.workspaces WHERE id = $1 AND owner')) return { rowCount: 1, rows: [{}] }
    if (sql.includes('FROM identity.users WHERE lower(email)')) return { rows: [{ id: 'u-new' }] }
    if (sql.includes('SELECT owner FROM dashboard.workspaces')) return { rows: [{ owner: 'u-owner' }] }
    if (sql.includes('LEFT JOIN identity.user_tiers'))
      return { rows: [{ account_type: 'user', tier, seat_limit: seatLimit }] }
    if (sql.includes('count(DISTINCT m.user_id)')) return { rows: [{ n: members }] }
    if (sql.includes('LIMIT 1')) return { rowCount: targetSeated ? 1 : 0, rows: [] }
    if (sql.includes('INSERT INTO dashboard.workspace_members')) return { rowCount: 1, rows: [] }
    throw new Error(`unexpected sql: ${sql}`)
  })
}

const invite = () =>
  POST(
    new NextRequest('http://x/api/workspaces/ws1/members', {
      method: 'POST',
      body: JSON.stringify({ email: 'new@x.com', role: 'editor' }),
    }),
    { params: Promise.resolve({ id: 'ws1' }) },
  )

const inserted = () => queryMock.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO dashboard.workspace_members'))

beforeEach(() => {
  queryMock.mockReset()
  emailMock.mockReset()
  emailMock.mockResolvedValue(true)
  cred.current = { kind: 'user', token: 'jwt', user: { user_id: 'u-owner', account_type: 'user' } }
})

describe('seat limit', () => {
  it('Operational owner cannot add anyone (1 seat = the owner)', async () => {
    db({ tier: 'operational', members: 0 })
    const r = await invite()
    expect(r.status).toBe(403)
    expect((await r.json()).code).toBe('SEAT_LIMIT')
    expect(inserted()).toBe(false)
  })

  it('Business owner can add a 5th person but not a 6th', async () => {
    db({ tier: 'business', members: 3 })
    expect((await invite()).status).toBe(200)
    queryMock.mockReset()
    db({ tier: 'business', members: 4 })
    expect((await invite()).status).toBe(403)
  })

  it('someone already in another of the owner workspaces takes no new seat', async () => {
    db({ tier: 'business', members: 4, targetSeated: true })
    expect((await invite()).status).toBe(200)
    expect(inserted()).toBe(true)
  })

  it('Enterprise uses the contract override', async () => {
    db({ tier: 'enterprise', seatLimit: 30, members: 20 })
    expect((await invite()).status).toBe(200)
  })

  it('platform admins are not limited', async () => {
    cred.current = { kind: 'user', token: 'jwt', user: { user_id: 'u-admin', account_type: 'superadmin' } }
    db({ tier: 'operational', members: 0 })
    expect((await invite()).status).toBe(200)
  })

  it('fails closed when the plan cannot be read', async () => {
    db({ tier: 'business', members: 0 })
    const base = queryMock.getMockImplementation()!
    queryMock.mockImplementation(async (sql: string, p?: unknown[]) => {
      if (sql.includes('LEFT JOIN identity.user_tiers')) throw new Error('db down')
      return base(sql, p)
    })
    expect((await invite()).status).toBe(500)
    expect(inserted()).toBe(false)
  })
})

describe('invite email', () => {
  const withInsert = (inserted: boolean) => {
    db({ tier: 'business', members: 1 })
    const base = queryMock.getMockImplementation()!
    queryMock.mockImplementation(async (sql: string, p?: unknown[]) =>
      String(sql).includes('INSERT INTO dashboard.workspace_members')
        ? { rowCount: 1, rows: [{ inserted }] }
        : base(sql, p),
    )
  }

  it('emails a brand-new member and says so', async () => {
    withInsert(true)
    const res = await invite()
    expect(emailMock).toHaveBeenCalledWith('jwt', 'ws1', 'u-new')
    expect((await res.json()).emailed).toBe(true)
  })

  it('does not email again when only the role changed', async () => {
    withInsert(false)
    const res = await invite()
    expect(emailMock).not.toHaveBeenCalled()
    expect((await res.json()).emailed).toBe(false)
  })

  it('reports emailed:false but still adds the member when the mail fails', async () => {
    withInsert(true)
    emailMock.mockResolvedValue(false)
    const res = await invite()
    expect(res.status).toBe(200)
    expect((await res.json()).emailed).toBe(false)
  })
})
