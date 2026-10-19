import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

vi.mock('@/lib/serverAuth', () => ({
  getAuthUserWithToken: vi.fn(),
}))

import { getAuthUserWithToken } from '@/lib/serverAuth'
import { chargeRun, requireFeatureBought, requireRunLeft } from './featureUses'

const req = {} as NextRequest
const signedIn = () =>
  (getAuthUserWithToken as ReturnType<typeof vi.fn>).mockReturnValue({ user: { user_id: 'u1' }, token: 'tok' })
const uses = (snapshot: object, blueprint: object = { remaining: 0, granted: 0, used: 0, unlimited: false }) =>
  vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ uses: { snapshot, blueprint } }) })

describe('featureUses gate', () => {
  beforeEach(() => signedIn())
  afterEach(() => vi.unstubAllGlobals())

  it('refuses a signed-out caller', async () => {
    ;(getAuthUserWithToken as ReturnType<typeof vi.fn>).mockReturnValue(null)
    const gate = await requireRunLeft(req, 'snapshot')
    expect(gate.ok).toBe(false)
    if (!gate.ok) expect(gate.response.status).toBe(401)
  })

  it('lets a run start while runs are left, and forwards the caller token', async () => {
    const fetchMock = uses({ remaining: 2, granted: 3, used: 1, unlimited: false })
    vi.stubGlobal('fetch', fetchMock)
    const gate = await requireRunLeft(req, 'snapshot')
    expect(gate.ok).toBe(true)
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer tok')
  })

  it('says "used up" after the runs, and "buy it" before any purchase', async () => {
    vi.stubGlobal('fetch', uses({ remaining: 0, granted: 3, used: 3, unlimited: false }))
    let gate = await requireRunLeft(req, 'snapshot')
    expect(gate.ok).toBe(false)
    if (!gate.ok) {
      expect(gate.response.status).toBe(402)
      expect((await gate.response.json()).message).toMatch(/used all 3/)
    }
    vi.stubGlobal('fetch', uses({ remaining: 0, granted: 0, used: 0, unlimited: false }))
    gate = await requireRunLeft(req, 'snapshot')
    if (!gate.ok) expect((await gate.response.json()).message).toMatch(/Purchase the Business Operations Assessment/)
  })

  it('treats unlimited (partner / superadmin) as always allowed', async () => {
    vi.stubGlobal('fetch', uses({ remaining: 0, granted: 0, used: 0, unlimited: true }))
    expect((await requireRunLeft(req, 'snapshot')).ok).toBe(true)
  })

  it('lets a roadmap through once the blueprint was bought, even with no runs left', async () => {
    vi.stubGlobal('fetch', uses({}, { remaining: 0, granted: 3, used: 3, unlimited: false }))
    expect((await requireFeatureBought(req, 'blueprint')).ok).toBe(true)
  })

  it('delivers on a successful charge, blocks on 402, and asks to poll again on a blip', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }))
    expect(await chargeRun(req, 'snapshot', 'diagnostic:j1', { status: 'waiting' })).toBeNull()

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 402 }))
    const blocked = await chargeRun(req, 'snapshot', 'diagnostic:j1', { status: 'waiting' })
    expect(blocked?.status).toBe(402)

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    const pending = await chargeRun(req, 'blueprint', 'blueprint:j2', { jobStatus: 'waiting' })
    expect(pending?.status).toBe(200)
    expect(await pending?.json()).toEqual({ jobStatus: 'waiting' })
  })
})
