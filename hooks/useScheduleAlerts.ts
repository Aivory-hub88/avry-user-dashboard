'use client'
/**
 * Scheduled runs that are not running — ADR-009 Phase 3.
 *
 * A schedule fails quietly by nature. Cerveau's reconcile acks the row back
 * as `failed` with a reason, but nothing in the office would say so, and the
 * one place that shows it (the Schedules tab, behind Customise Agent) is the
 * last place someone looks when they have not noticed anything is wrong.
 * That is the whole failure mode ADR-009 §6 exists to prevent, arriving from
 * a different direction: work the customer believes is happening, silently
 * not happening.
 *
 * Only `failed` is surfaced. `pending_activation` is a normal, transient
 * state during the reconcile's own interval — a notification for it would
 * fire on every edit and teach people to ignore the feed.
 *
 * One list call for every agent at once (the endpoint groups by agent when
 * no `agent_type` is given), refreshed only on mount. These rows change when
 * a person edits a schedule or a reconcile pass acks one, neither of which
 * is worth a poll — and a stale-by-a-few-minutes warning is still the
 * warning.
 *
 * Fails silently by design: if the list call itself fails, the feed shows
 * what it does have rather than an error about a secondary concern. The
 * Schedules tab is where a broken scheduled-runs API gets reported.
 */
import { useEffect, useMemo, useState } from 'react'
import { listScheduledRuns, type ScheduledRun } from '@/lib/tenantScheduledRuns'

export function useScheduleAlerts(): { failedByAgent: Record<string, ScheduledRun[]> } {
  const [failed, setFailed] = useState<ScheduledRun[]>([])

  useEffect(() => {
    let cancelled = false
    listScheduledRuns()
      .then(({ runs }) => {
        if (!cancelled) setFailed(runs.filter((r) => r.status === 'failed'))
      })
      .catch(() => {
        // Deliberately swallowed — see the module doc.
      })
    return () => {
      cancelled = true
    }
  }, [])

  const failedByAgent = useMemo(() => {
    return failed.reduce<Record<string, ScheduledRun[]>>((acc, run) => {
      ;(acc[run.agent_type] ??= []).push(run)
      return acc
    }, {})
  }, [failed])

  return { failedByAgent }
}
