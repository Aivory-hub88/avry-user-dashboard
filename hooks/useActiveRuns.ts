'use client'
/**
 * "Running now" — what AgentRail's Running now section and MissionControl's
 * per-card status read to show a turn actually in flight (Console chat,
 * Telegram, or Slack), instead of the permanently-static "Not running
 * anything right now." this section used to render (see
 * docs/CERVEAU-WORKING-OFFICE-PLANNING.md — there was no data source for
 * this at all until agent_run_tracker.py).
 *
 * Polled, not fetch-on-mount-only like useScheduleAlerts: a run is only
 * "now" for as long as it's actually running (typically well under a
 * minute), so a stale-by-minutes read would show something that already
 * finished. 10s keeps the badge feeling live without hammering a Redis read
 * that's already the cheap kind of cache_manager call.
 *
 * Fails silently: a transient error here shouldn't make "Running now" show
 * an alarming error state over what's fundamentally a nice-to-have status
 * indicator, not a decision the user needs to act on the way an approval is.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { listActiveRuns, type ActiveAgentRun } from '@/lib/agentRuns'

const POLL_MS = 10_000

export function useActiveRuns() {
  const [runs, setRuns] = useState<ActiveAgentRun[]>([])

  const refetch = useCallback(() => {
    listActiveRuns()
      .then(setRuns)
      .catch(() => {
        // Deliberately swallowed — see the module doc.
      })
  }, [])

  useEffect(() => {
    refetch()
    const interval = setInterval(refetch, POLL_MS)
    return () => clearInterval(interval)
  }, [refetch])

  const byAgentType = useMemo(() => {
    const map: Record<string, ActiveAgentRun> = {}
    for (const r of runs) map[r.agent_type] = r
    return map
  }, [runs])

  return { runs, byAgentType }
}
