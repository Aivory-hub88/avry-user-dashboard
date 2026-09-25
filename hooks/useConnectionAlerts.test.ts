import { describe, it, expect } from 'vitest'
import { connectionAlertsFrom } from './useConnectionAlerts'
import { credentialDaysLeft, type TenantMcpServer } from '@/lib/tenantMcpServers'

const NOW = Date.parse('2026-09-25T12:00:00Z')

function server(over: Partial<TenantMcpServer>): TenantMcpServer {
  return {
    id: 's', agent_type: 'autonomous', name: 'odoo', url: 'https://odoo-mcp.aivory.uk/mcp?token=x',
    transport: 'streamable-http', auth_header_name: null, status: 'verified', last_verified_at: null,
    last_verify_error: null, tool_count: 18, created_at: '2026-09-20T00:00:00Z', tools: [], disabled_tools: [],
    credential_expires_at: null, ...over,
  }
}

describe('connection alerts', () => {
  it('flags an Odoo key expiring within a week, not later ones', () => {
    const soon = server({ id: 'a', credential_expires_at: '2026-09-27T00:00:00Z' })
    const later = server({ id: 'b', credential_expires_at: '2026-12-19T00:00:00Z' })
    const alerts = connectionAlertsFrom([soon, later], NOW)
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({ id: 'conn:a', state: 'expiring', daysLeft: 1 })
  })

  it('flags a rejected connection with its reason', () => {
    const failed = server({ id: 'c', agent_type: 'leads_qualifier', status: 'verification_failed', last_verify_error: 'Odoo rejected the API key' })
    expect(connectionAlertsFrom([failed], NOW)[0]).toMatchObject({ agentType: 'leads_qualifier', state: 'failed', detail: 'Odoo rejected the API key' })
  })

  it('ignores unknown expiry and disabled rows', () => {
    expect(connectionAlertsFrom([server({}), server({ status: 'disabled', credential_expires_at: '2026-09-26T00:00:00Z' })], NOW)).toEqual([])
  })

  it('credentialDaysLeft is 0 or less once past', () => {
    expect(credentialDaysLeft({ credential_expires_at: '2026-09-25T00:00:00Z' }, 7, NOW)).toBeLessThanOrEqual(0)
    expect(credentialDaysLeft({ credential_expires_at: 'nonsense' }, 7, NOW)).toBeNull()
  })
})
