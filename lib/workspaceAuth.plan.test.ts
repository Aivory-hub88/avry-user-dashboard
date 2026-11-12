import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const gateMock = vi.fn()
vi.mock('@/lib/planGate', () => ({
  requirePaidPlan: (...a: unknown[]) => gateMock(...a),
}))
vi.mock('@/lib/db', () => ({ query: vi.fn() }))

import { workspacePlanDenied, type WorkspaceCredential } from './workspaceAuth'

const req = () => new NextRequest('http://localhost/api/workspace/rooms')
const user: WorkspaceCredential = {
  kind: 'user',
  token: 't',
  user: { user_id: 'u1', email: 'a@b.c', account_type: 'user' } as never,
}

describe('workspacePlanDenied', () => {
  beforeEach(() => gateMock.mockReset())

  it('lets a paying caller through', async () => {
    gateMock.mockResolvedValue({ ok: true })
    expect(await workspacePlanDenied(req(), user)).toBeNull()
    expect(gateMock).toHaveBeenCalledWith(expect.anything(), 'workspace')
  })

  it('refuses a free account with the gate response (402)', async () => {
    const response = NextResponse.json({ code: 'UPGRADE_REQUIRED' }, { status: 402 })
    gateMock.mockResolvedValue({ ok: false, code: 'UPGRADE_REQUIRED', response })
    const denied = await workspacePlanDenied(req(), user)
    expect(denied?.status).toBe(402)
  })

  it('passes the module through', async () => {
    gateMock.mockResolvedValue({ ok: true })
    await workspacePlanDenied(req(), user, '*')
    expect(gateMock).toHaveBeenCalledWith(expect.anything(), '*')
  })

  it('does not plan-check service-token calls', async () => {
    expect(await workspacePlanDenied(req(), { kind: 'service', token: 's' })).toBeNull()
    expect(gateMock).not.toHaveBeenCalled()
  })
})
