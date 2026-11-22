'use client'

/**
 * Credit gate for the n8n-over-MCP option. Access follows usable credits, NOT
 * the plan tier (docs/N8N-MCP-CONNECTION-PLAN-2026-11.md §4d): an account may
 * use it when its credits are unlimited or its spendable balance is above 0.
 * The backend is the real enforcer (402); this only decides what to render.
 */

import { useEffect, useState } from 'react'
import { getCredits, type CreditStatus } from '@/lib/agentProfiles'

export type N8nMcpAccess = 'loading' | 'allowed' | 'no_credit' | 'unknown'

export function hasUsableCredits(credits: CreditStatus | null | undefined): boolean {
  if (!credits) return false
  if (credits.unlimited) return true
  const spendable =
    credits.balance ?? (credits.monthly_balance ?? 0) + (credits.extra_balance ?? 0)
  return spendable > 0
}

/** `unknown` = the credit lookup itself failed; callers show nothing new
 *  rather than a wrong "no credits" message. */
export function useN8nMcpAccess(enabled = true): N8nMcpAccess {
  const [access, setAccess] = useState<N8nMcpAccess>('loading')
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    getCredits()
      .then((status) => {
        if (cancelled) return
        setAccess(status === null ? 'unknown' : hasUsableCredits(status) ? 'allowed' : 'no_credit')
      })
      .catch(() => {
        if (!cancelled) setAccess('unknown')
      })
    return () => {
      cancelled = true
    }
  }, [enabled])
  return access
}
