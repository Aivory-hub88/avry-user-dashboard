import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import jwt from 'jsonwebtoken'
import { NextRequest } from 'next/server'
import { resolveIntegrationUser } from './integration-auth'

const SECRET = 'test-secret'

function req(headers: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost/dashboard/api/integrations/oauth', { headers })
}

describe('resolveIntegrationUser without shared cookies', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = SECRET
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ tier: 'operational' }), { status: 200 })))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('accepts a valid Bearer JWT when the cookies expired', async () => {
    const token = jwt.sign({ user_id: 'u-1', email: 'a@b.c', account_type: 'user', type: 'access' }, SECRET, { algorithm: 'HS256' })
    const res = await resolveIntegrationUser(req({ authorization: `Bearer ${token}` }))
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.userId).toBe('u-1')
  })

  it('still rejects a request with no credentials', async () => {
    const res = await resolveIntegrationUser(req({}))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.status).toBe(401)
  })

  it('rejects a Bearer JWT signed with the wrong secret', async () => {
    const token = jwt.sign({ user_id: 'u-1', type: 'access' }, 'other', { algorithm: 'HS256' })
    const res = await resolveIntegrationUser(req({ authorization: `Bearer ${token}` }))
    expect(res.ok).toBe(false)
  })
})
