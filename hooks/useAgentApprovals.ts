'use client'
/**
 * Shared polling source for pending agent approvals, grouped by agent.
 *
 * One implementation, reused wherever a pending-approval count or list is
 * shown: the Console agent column's per-agent badges, the agent rail's
 * "Waiting on you" section, and the global nav's approvals badge. Each
 * caller gets its own subscription/poll (there's no cross-tree store here —
 * that's more machinery than three read-mostly badges justify), but the
 * grouping/dedup/resolve logic lives in exactly one place.
 *
 * `excludeIds` lets a caller hide approvals it's already rendering itself —
 * the Console page passes the ids of any pendingApproval currently shown
 * inline in the open thread, so a decision never appears twice (inline +
 * rail). Callers with no such context (the global nav) pass nothing and see
 * the full, undeduped count — matching what the nav badge always showed.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { listPendingApprovalsByAgent, resolveApproval, type PendingApproval } from '@/lib/agentApprovals'

const POLL_MS = 60_000

export function useAgentApprovals(excludeIds?: Iterable<string>) {
  const [byAgent, setByAgent] = useState<Record<string, PendingApproval[]>>({})
  const [error, setError] = useState(false)
  // Distinguishes "haven't fetched yet" from "fetched, genuinely zero" —
  // callers that only want to auto-open on a real pending decision (not on
  // the empty state before the first response lands) need this.
  const [loaded, setLoaded] = useState(false)
  const exclude = useMemo(() => new Set(excludeIds ?? []), [excludeIds])

  const refetch = useCallback(() => {
    listPendingApprovalsByAgent()
      .then((grouped) => {
        const filtered: Record<string, PendingApproval[]> = {}
        for (const [key, list] of Object.entries(grouped)) {
          filtered[key] = list.filter((a) => !exclude.has(a.id))
        }
        setByAgent(filtered)
        setError(false)
      })
      .catch(() => {
        setByAgent({})
        setError(true)
      })
      .finally(() => setLoaded(true))
  }, [exclude])

  useEffect(() => {
    refetch()
    const interval = setInterval(refetch, POLL_MS)
    return () => clearInterval(interval)
  }, [refetch])

  const resolve = useCallback(async (approval: PendingApproval, decision: 'approve' | 'deny') => {
    await resolveApproval(approval, decision)
    setByAgent((prev) => {
      const next: Record<string, PendingApproval[]> = {}
      for (const [key, list] of Object.entries(prev)) {
        next[key] = list.filter((a) => a.id !== approval.id)
      }
      return next
    })
  }, [])

  const total = Object.values(byAgent).reduce((n, list) => n + list.length, 0)

  return { byAgent, total, error, loaded, refetch, resolve }
}
