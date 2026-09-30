/**
 * OAuth callback against what Composio v3 actually sends:
 * `?status=success&connected_account_id=ca_...` (plus whatever we put on the URL).
 * Regression: every successful connect showed "OAuth error: not_active" because
 * the callback required an `appName` Composio never sends.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { getAccount } = vi.hoisted(() => ({ getAccount: vi.fn() }))

vi.mock('@/lib/integration-auth', () => ({ resolveIntegrationUser: async () => ({ ok: true, userId: 'u1' }) }))
vi.mock('@/lib/composio', () => ({
  getComposioClient: () => ({ connectedAccounts: { get: getAccount } }),
  getComposioRedirectUrl: () => 'https://app.test/dashboard/integrations/callback',
}))

import { GET } from './route'

async function callback(query: string) {
  const res = await GET(new NextRequest(`https://app.test/dashboard/integrations/callback?${query}`))
  return new URL(res.headers.get('location') ?? '')
}

beforeEach(() => {
  getAccount.mockReset()
  vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout'] })
})

describe('integrations callback (Composio v3 params)', () => {
  it('connects when the app rides on the URL and the account is ACTIVE', async () => {
    getAccount.mockResolvedValue({ status: 'ACTIVE', toolkit: { slug: 'googlesheets' } })
    const loc = await callback('appName=googlesheets&status=success&connected_account_id=ca_1')
    expect(loc.searchParams.get('error')).toBeNull()
    expect(loc.toString()).toContain('googlesheets')
  })

  it('still connects when no app is on the URL: it asks Composio which toolkit the account is', async () => {
    getAccount.mockResolvedValue({ status: 'ACTIVE', toolkit: { slug: 'googledrive' } })
    const loc = await callback('status=success&connected_account_id=ca_2')
    expect(loc.toString()).not.toContain('not_active')
    expect(loc.toString()).toContain('googledrive')
  })

  it('waits for an INITIATED account to turn ACTIVE instead of failing', async () => {
    getAccount
      .mockResolvedValueOnce({ status: 'INITIATED', toolkit: { slug: 'gmail' } })
      .mockResolvedValueOnce({ status: 'ACTIVE', toolkit: { slug: 'gmail' } })
    const loc = await callback('appName=gmail&status=success&connected_account_id=ca_3')
    expect(loc.toString()).not.toContain('not_active')
    expect(getAccount).toHaveBeenCalledTimes(2)
  })

  it('reports not_active for an account that failed', async () => {
    getAccount.mockResolvedValue({ status: 'FAILED', toolkit: { slug: 'gmail' } })
    const loc = await callback('appName=gmail&status=failed&connected_account_id=ca_4')
    expect(loc.toString()).toContain('not_active')
  })

  it('keeps a provider denial as classified and never asks Composio', async () => {
    const loc = await callback('error=access_denied&connected_account_id=ca_5')
    expect(loc.toString()).toContain('access_denied')
    expect(getAccount).not.toHaveBeenCalled()
  })

  it('does not crash when Composio is unreachable', async () => {
    getAccount.mockRejectedValue(new Error('network'))
    const loc = await callback('appName=googledocs&status=success&connected_account_id=ca_6')
    expect(loc.toString()).toContain('googledocs')
  })
})
