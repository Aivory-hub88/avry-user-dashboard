'use client'
/**
 * Mission Control tasks that need a person, for the notification feed.
 *
 * The board's Waiting column is fed by the task ledger, but the feed only
 * knew approvals, replies, schedules and connections. A task parked
 * `blocked` without an approval behind it (a failed delegation, "context
 * window exceeded", missing input) therefore raised no badge and no rail
 * card: it sat on the board for days and nobody was told. This closes that
 * gap — every card the board puts under Waiting, plus any open task past its
 * SLA, now also shows up where people actually look.
 *
 * Blocked tasks whose reason is an approval wait are skipped: the approval
 * feed already notifies for those (with Approve / Deny), and counting both
 * would double the badge.
 *
 * Errors are swallowed like the other alert hooks: a missing alert must
 * never break the rail.
 */
import { useEffect, useMemo, useState } from 'react'
import { authedFetch } from '@/lib/deployAuth'
import type { EnrichedTask } from '@/lib/airaTasks'

const POLL_MS = 60_000
export const TASKS_CHANGED_EVENT = 'aivory:tasks-changed'

export function notifyTasksChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(TASKS_CHANGED_EVENT))
}

export interface TaskAlert {
  taskId: string
  agentType: string
  title: string
  reason: string | null
  /** true = parked in Waiting; false = open but past its SLA. */
  blocked: boolean
  updatedAt: number
}

const APPROVAL_WAIT = /approv/i

export function taskAlertsFrom(tasks: EnrichedTask[]): TaskAlert[] {
  const out: TaskAlert[] = []
  for (const t of tasks) {
    const blocked = t.status === 'blocked'
    const stuck = blocked || (t.overdue && (t.status === 'todo' || t.status === 'in_progress'))
    if (!stuck) continue
    if (blocked && t.blocked_reason && APPROVAL_WAIT.test(t.blocked_reason)) continue
    const updatedAt = new Date(t.updated_at).getTime()
    out.push({
      taskId: t.task_id,
      agentType: t.agent_type,
      title: t.title || 'Untitled task',
      reason: t.blocked_reason,
      blocked,
      updatedAt: Number.isNaN(updatedAt) ? Date.now() : updatedAt,
    })
  }
  return out
}

export function useTaskAlerts(): { stuckByAgent: Record<string, TaskAlert[]> } {
  const [alerts, setAlerts] = useState<TaskAlert[]>([])

  useEffect(() => {
    let cancelled = false
    const load = () =>
      authedFetch('/api/aira/tasks?limit=100')
        .then((r) => (r.ok ? (r.json() as Promise<{ tasks?: EnrichedTask[] }>) : null))
        .then((j) => {
          if (!cancelled && j) setAlerts(taskAlertsFrom(j.tasks ?? []))
        })
        .catch(() => {
          // Deliberately swallowed — see the module doc.
        })
    load()
    const t = setInterval(load, POLL_MS)
    window.addEventListener(TASKS_CHANGED_EVENT, load)
    return () => {
      cancelled = true
      clearInterval(t)
      window.removeEventListener(TASKS_CHANGED_EVENT, load)
    }
  }, [])

  const stuckByAgent = useMemo(
    () =>
      alerts.reduce<Record<string, TaskAlert[]>>((acc, a) => {
        ;(acc[a.agentType] ??= []).push(a)
        return acc
      }, {}),
    [alerts],
  )
  return { stuckByAgent }
}
