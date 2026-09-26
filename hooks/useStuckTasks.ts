'use client'
/**
 * Stuck tasks — ledger rows that need a human because no live turn owns
 * them anymore.
 *
 * The rail's "Running now" feed (useActiveRuns) only sees turns actually in
 * flight. A row left `in_progress`/`blocked` past its SLA with nothing
 * running behind it is invisible there and — the board being read-only —
 * unstoppable. This hook surfaces those orphans per agent so the rail can
 * offer the operator Stop button (PATCH /api/aira/tasks/[id] → cancelled).
 *
 * Stuck = open row (in_progress/blocked) + overdue, for one agent type.
 * Freshly-running work is never overdue by construction (SLA 15m/60m), so
 * this does not flag healthy turns. Best-effort: failures yield an empty
 * list, never an error state.
 */
import { useCallback, useEffect, useState } from 'react'
import { authedFetch } from '@/lib/deployAuth'
import type { EnrichedTask } from '@/lib/airaTasks'

interface StuckResponse {
  columns: {
    in_progress: EnrichedTask[]
    blocked: EnrichedTask[]
  }
}

const POLL_MS = 15_000

async function stopTaskOnServer(taskId: string): Promise<void> {
  const r = await authedFetch(
    `/api/aira/tasks/${encodeURIComponent(taskId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ action: 'stop' }),
    },
  )
  if (!r.ok) {
    const detail = await r.json().catch(() => null)
    throw new Error(
      (detail as { error?: string } | null)?.error ?? `Stop failed (${r.status})`,
    )
  }
}

export function useStuckTasks(agentType: string | null) {
  const [stuck, setStuck] = useState<EnrichedTask[]>([])
  const [stoppingId, setStoppingId] = useState<string | null>(null)
  const [stopError, setStopError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!agentType) {
      setStuck([])
      return
    }
    try {
      const r = await authedFetch('/api/aira/tasks?limit=100')
      if (!r.ok) return
      const j = (await r.json()) as StuckResponse
      const rows = [...(j.columns?.in_progress ?? []), ...(j.columns?.blocked ?? [])]
      setStuck(
        rows.filter((t) => t.agent_type === agentType && t.overdue),
      )
    } catch {
      // Best-effort — a ledger blip must not alarm the rail.
    }
  }, [agentType])

  useEffect(() => {
    // Poll from mount; refetch only sets state after its await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refetch()
    const t = setInterval(refetch, POLL_MS)
    return () => clearInterval(t)
  }, [refetch])

  const stopTask = useCallback(
    async (taskId: string) => {
      setStopError(null)
      setStoppingId(taskId)
      try {
        await stopTaskOnServer(taskId)
        await refetch()
      } catch (e) {
        setStopError(e instanceof Error ? e.message : 'Stop failed')
      } finally {
        setStoppingId(null)
      }
    },
    [refetch],
  )

  return { stuck, stoppingId, stopError, stopTask, refetchStuck: refetch }
}
