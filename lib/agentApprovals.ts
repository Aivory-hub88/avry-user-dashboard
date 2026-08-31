/**
 * Pending tool-call approvals across every agent this user has deployed —
 * Cerveau's F-1 hard-floor gate surfaced in the dashboard. Backend:
 * avry-backend /api/v1/agent-approvals (JWT), which itself proxies the
 * Cerveau gateway's tenant-scoped GET/POST /webhook/approvals endpoints.
 *
 * Mirrors agentToolScope.ts's shape/conventions exactly.
 */

import { authedFetch } from './deployAuth'

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || 'https://backend.aivory.id'

export interface PendingApproval {
  id: string
  principal: string
  tool_name: string
  arguments: Record<string, unknown>
  risk_tier: string
  requested_at: string
  status: string
  resolved_at: string | null
  resolved_by: string | null
  /** Present on rows returned by the list endpoint — required to resolve
   *  without avry-backend re-scanning every (instance, agent_type) pair. */
  _gateway_base?: string
  _agent_type?: string
}

export async function listPendingApprovals(): Promise<PendingApproval[]> {
  const res = await authedFetch(`${BACKEND_URL}/api/v1/agent-approvals`)
  if (!res.ok) throw new Error(`Failed to load approvals (${res.status})`)
  const data = await res.json()
  return data.approvals ?? []
}

/** Same list, grouped by `_agent_type` — 'unknown' for any row missing it. */
export async function listPendingApprovalsByAgent(): Promise<Record<string, PendingApproval[]>> {
  const approvals = await listPendingApprovals()
  return approvals.reduce<Record<string, PendingApproval[]>>((acc, a) => {
    const key = a._agent_type ?? 'unknown'
    ;(acc[key] ??= []).push(a)
    return acc
  }, {})
}

export interface ResolveApprovalResult {
  success: boolean
  outcome: string | null
  reply: string | null
}

export async function resolveApproval(
  approval: Pick<PendingApproval, 'id' | '_gateway_base' | '_agent_type'>,
  decision: 'approve' | 'deny',
): Promise<ResolveApprovalResult> {
  const res = await authedFetch(`${BACKEND_URL}/api/v1/agent-approvals/${approval.id}/resolve`, {
    method: 'POST',
    body: JSON.stringify({
      decision,
      gateway_base: approval._gateway_base ?? null,
      agent_type: approval._agent_type ?? null,
    }),
  })
  if (!res.ok) throw new Error(`Failed to resolve approval (${res.status})`)
  return res.json()
}

export function describeTool(toolName: string): string {
  const [server, action] = toolName.includes('__') ? toolName.split('__') : [null, toolName]
  const toolkit = server
    ?.replace(/^composio-/, '')
    .replace(/-[a-z]+$/, '')
    .replace(/^\w/, (c) => c.toUpperCase()) ?? null
  const readable = action
    .replace(/^[A-Z]+_/, '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase())
  return toolkit ? `${toolkit} — ${readable}` : readable
}
