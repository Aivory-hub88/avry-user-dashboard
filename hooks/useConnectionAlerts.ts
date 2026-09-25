'use client'
/**
 * Standing problems with an agent's connected tools, for the office rail:
 * a connection whose credential was rejected (verification_failed) or whose
 * Odoo API key expires within a week. The backend checks Odoo keys every
 * 6 h (check_shared_odoo_keys); without surfacing it here the only warning
 * lived inside Customise agent, where nobody looks until the agent fails.
 *
 * Errors are swallowed on purpose, same as useScheduleAlerts: a missing
 * alert must never break the rail.
 */
import { useEffect, useMemo, useState } from 'react'
import { credentialDaysLeft, listAllTenantMcpServers, type TenantMcpServer } from '@/lib/tenantMcpServers'

const POLL_MS = 10 * 60_000

export interface ConnectionAlert {
  id: string
  agentType: string
  serverName: string
  /** 'failed' = reconnect needed now; 'expiring' = key ends within 7 days. */
  state: 'failed' | 'expiring'
  daysLeft: number | null
  detail: string | null
}

export function connectionAlertsFrom(servers: TenantMcpServer[], now = Date.now()): ConnectionAlert[] {
  const out: ConnectionAlert[] = []
  for (const s of servers) {
    if (s.status === 'verification_failed') {
      out.push({ id: `conn:${s.id}`, agentType: s.agent_type, serverName: s.name, state: 'failed', daysLeft: null, detail: s.last_verify_error })
    } else if (s.status === 'verified') {
      const days = credentialDaysLeft(s, 7, now)
      if (days !== null) {
        out.push({ id: `conn:${s.id}`, agentType: s.agent_type, serverName: s.name, state: 'expiring', daysLeft: days, detail: null })
      }
    }
  }
  return out
}

export function useConnectionAlerts(): { alertsByAgent: Record<string, ConnectionAlert[]> } {
  const [alerts, setAlerts] = useState<ConnectionAlert[]>([])

  useEffect(() => {
    let cancelled = false
    const load = () =>
      listAllTenantMcpServers()
        .then((servers) => {
          if (!cancelled) setAlerts(connectionAlertsFrom(servers))
        })
        .catch(() => {})
    load()
    const t = setInterval(load, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [])

  const alertsByAgent = useMemo(
    () =>
      alerts.reduce<Record<string, ConnectionAlert[]>>((acc, a) => {
        ;(acc[a.agentType] ??= []).push(a)
        return acc
      }, {}),
    [alerts],
  )
  return { alertsByAgent }
}
