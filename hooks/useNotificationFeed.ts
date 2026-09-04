'use client'
/**
 * Merges approvals and thread activity into one per-agent feed — the data
 * plumbing behind Phase 10's Notification Center. Wraps the two existing
 * hooks rather than re-fetching anything; `approvalsByAgent` is still
 * exposed on its own for callers (Mission Control) that only need the raw
 * approval counts, same as before this hook existed.
 */
import { useMemo } from 'react'
import { useAgentApprovals } from './useAgentApprovals'
import { useScheduleAlerts } from './useScheduleAlerts'
import { useThreadActivity } from './useThreadActivity'
import type { ChatSession } from './useChat'
import type { Notification } from '@/types/notifications'

export function useNotificationFeed({
  sessionsByAgent,
  currentSessionId,
  excludeApprovalIds,
}: {
  sessionsByAgent: Record<string, ChatSession[]>
  currentSessionId: string
  excludeApprovalIds?: Iterable<string>
}) {
  const approvals = useAgentApprovals(excludeApprovalIds)
  const { activityByAgent } = useThreadActivity(sessionsByAgent, currentSessionId)
  // ADR-009 Phase 3. The one data source here that is genuinely new — but a
  // schedule that has stopped running is invisible everywhere else in the
  // office, and "work the customer thinks is happening, silently not
  // happening" is the failure this whole feature was built around.
  const { failedByAgent } = useScheduleAlerts()

  const byAgent = useMemo(() => {
    const result: Record<string, Notification[]> = {}
    const keys = new Set([
      ...Object.keys(approvals.byAgent),
      ...Object.keys(activityByAgent),
      ...Object.keys(failedByAgent),
    ])
    for (const key of keys) {
      const items: Notification[] = [
        ...(approvals.byAgent[key] ?? []).map((a): Notification => ({
          id: `approval:${a.id}`,
          kind: 'approval',
          agentType: key,
          approval: a,
        })),
        ...(activityByAgent[key] ?? []).map((act): Notification => ({
          id: `activity:${act.sessionId}`,
          kind: 'activity',
          agentType: key,
          sessionId: act.sessionId,
          title: act.title,
          updatedAt: act.updatedAt,
        })),
        ...(failedByAgent[key] ?? []).map((run): Notification => ({
          id: `schedule:${run.id}`,
          kind: 'status',
          agentType: key,
          title: run.name,
          detail: run.status_detail,
        })),
      ]
      if (items.length > 0) result[key] = items
    }
    return result
  }, [approvals.byAgent, activityByAgent, failedByAgent])

  return {
    byAgent,
    approvalsByAgent: approvals.byAgent,
    approvalsLoaded: approvals.loaded,
    approvalsError: approvals.error,
    resolveApproval: approvals.resolve,
    retryApprovals: approvals.refetch,
  }
}
