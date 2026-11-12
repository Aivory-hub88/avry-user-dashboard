import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({ query: vi.fn() }))
vi.mock('@/lib/serverAuth', () => ({ getAuthUserWithToken: vi.fn() }))

import { query } from '@/lib/db'
import { getAuthUserWithToken } from '@/lib/serverAuth'
import { decidePlanAccess, requirePaidPlan, clearPlanCache, ANY_MODULE, type TeamGrant } from './planGate'
import { requireModule } from './teamAccess'

const grant = (over: Partial<TeamGrant> = {}): TeamGrant => ({
  role: 'editor', modules: ['console'], ownerTier: 'business', ownerAccountType: 'user', ...over,
})

describe('decidePlanAccess', () => {
  it('lets staff and demo through without a plan', () => {
    for (const accountType of ['superadmin', 'admin', 'employee', 'demo']) {
      expect(decidePlanAccess({ accountType, tier: 'free', grants: [], module: 'console' }).ok).toBe(true)
    }
  })

  it('lets every paid tier through, one-time buyers included', () => {
    for (const tier of ['operational', 'business', 'enterprise', 'snapshot', 'blueprint', 'pro']) {
      expect(decidePlanAccess({ accountType: 'user', tier, grants: [], module: 'workflows' }).ok).toBe(true)
    }
  })

  it('asks a planless account to upgrade', () => {
    expect(decidePlanAccess({ accountType: 'user', tier: 'free', grants: [], module: 'console' }))
      .toEqual({ ok: false, status: 402, code: 'UPGRADE_REQUIRED' })
    // A partner whose free months ended is planless too.
    expect(decidePlanAccess({ accountType: 'partner', tier: 'free', grants: [], module: 'console' }).ok).toBe(false)
  })

  it('ignores team seats on an owner without a live subscription', () => {
    const own = grant({ ownerTier: null })
    const freeOwner = grant({ ownerTier: 'free' })
    const oneTimeOwner = grant({ ownerTier: 'snapshot' })
    for (const g of [own, freeOwner, oneTimeOwner]) {
      expect(decidePlanAccess({ accountType: 'user', tier: 'free', grants: [g], module: 'console' }).ok).toBe(false)
    }
    expect(decidePlanAccess({
      accountType: 'user', tier: 'free', grants: [grant({ ownerTier: null, ownerAccountType: 'superadmin' })], module: 'console',
    }).ok).toBe(true)
  })

  it('honours module grants from a paying team', () => {
    const g = [grant({ modules: ['console'] })]
    expect(decidePlanAccess({ accountType: 'user', tier: 'free', grants: g, module: 'console' }).ok).toBe(true)
    expect(decidePlanAccess({ accountType: 'user', tier: 'free', grants: g, module: 'workflows' }))
      .toEqual({ ok: false, status: 403, code: 'MODULE_DISABLED' })
    expect(decidePlanAccess({ accountType: 'user', tier: 'free', grants: g, module: ANY_MODULE }).ok).toBe(true)
  })
})

describe('requirePaidPlan', () => {
  const req = {} as never
  const fetchMock = vi.fn()

  beforeEach(() => {
    clearPlanCache()
    vi.mocked(query).mockReset()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    vi.mocked(getAuthUserWithToken).mockReturnValue({ user: { user_id: 'u1', account_type: 'user' }, token: 't' })
  })

  const tierIs = (tier: string) =>
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ tier }), { status: 200 }))

  it('401s without a verified token', async () => {
    vi.mocked(getAuthUserWithToken).mockReturnValue(null)
    const g = await requirePaidPlan(req, 'console')
    expect(g.ok).toBe(false)
    if (!g.ok) expect(g.response.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('402s a planless account with UPGRADE_REQUIRED + operational', async () => {
    tierIs('free')
    vi.mocked(query).mockResolvedValue({ rowCount: 0, rows: [] } as never)
    const g = await requirePaidPlan(req, 'console')
    expect(g.ok).toBe(false)
    if (!g.ok) {
      expect(g.response.status).toBe(402)
      expect(await g.response.json()).toMatchObject({ code: 'UPGRADE_REQUIRED', requiredTier: 'operational' })
    }
  })

  it('passes a paying account without touching the team tables, and caches the tier', async () => {
    tierIs('operational')
    expect((await requirePaidPlan(req, 'workflows')).ok).toBe(true)
    expect((await requirePaidPlan(req, 'console')).ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(query).not.toHaveBeenCalled()
  })

  it('does not trust a tier the browser could send: only the backend answer counts', async () => {
    tierIs('free')
    vi.mocked(query).mockResolvedValue({ rowCount: 0, rows: [] } as never)
    vi.mocked(getAuthUserWithToken).mockReturnValue({
      user: { user_id: 'u1', account_type: 'user', tier: 'enterprise' } as never, token: 't',
    })
    expect((await requirePaidPlan(req, 'console')).ok).toBe(false)
  })

  it('fails closed when the backend or the database is down', async () => {
    fetchMock.mockRejectedValue(new Error('down'))
    let g = await requirePaidPlan(req, 'console')
    if (!g.ok) expect(g.response.status).toBe(503)
    else throw new Error('expected 503')

    clearPlanCache()
    tierIs('free')
    vi.mocked(query).mockRejectedValue(new Error('db down'))
    g = await requirePaidPlan(req, 'console')
    if (!g.ok) expect(g.response.status).toBe(503)
    else throw new Error('expected 503')
  })

  it('401s when the backend rejects the token', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 401 }))
    const g = await requirePaidPlan(req, 'console')
    if (!g.ok) expect(g.response.status).toBe(401)
    else throw new Error('expected 401')
  })

  it('requireModule maps onto the same gate', async () => {
    tierIs('free')
    vi.mocked(query).mockResolvedValue({
      rowCount: 1, rows: [{ role: 'editor', modules: ['console'], owner_tier: 'business', owner_account_type: 'user' }],
    } as never)
    expect(await requireModule(req, 'console')).toBeNull()
    const denied = await requireModule(req, 'workflows')
    expect(denied?.status).toBe(403)
    expect((await denied!.json()).code).toBe('MODULE_DISABLED')
  })
})
