import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { gateMock } = vi.hoisted(() => ({ gateMock: vi.fn() }))
vi.mock('@/lib/planGate', () => ({ requirePaidPlan: (...a: unknown[]) => gateMock(...a) }))

const { listMock } = vi.hoisted(() => ({ listMock: vi.fn((..._a: unknown[]) => [] as unknown[]) }))
vi.mock('@/lib/integrations/store', () => ({
  listConnections: (...a: unknown[]) => listMock(...a),
  createConnection: vi.fn(),
}))

import { GET } from './route'

const req = (headers: Record<string, string> = {}) =>
  new NextRequest('http://localhost/api/integrations/connections', { headers })

beforeEach(() => {
  gateMock.mockReset()
  listMock.mockClear()
})

describe('/api/integrations/connections', () => {
  it('refuses a free account (402) without reading the store', async () => {
    gateMock.mockResolvedValue({
      ok: false,
      code: 'UPGRADE_REQUIRED',
      response: Response.json({ code: 'UPGRADE_REQUIRED' }, { status: 402 }),
    })
    expect((await GET(req())).status).toBe(402)
    expect(listMock).not.toHaveBeenCalled()
  })

  it("reads the caller's own tenant and ignores a client tenant header", async () => {
    gateMock.mockResolvedValue({ ok: true, user: { user_id: 'user-1' }, token: 't' })
    expect((await GET(req({ 'x-tenant-id': 'someone-else' }))).status).toBe(200)
    expect(gateMock).toHaveBeenCalledWith(expect.anything(), 'integrations')
    expect(listMock.mock.calls[0][0]).toBe('user-1')
  })
})
