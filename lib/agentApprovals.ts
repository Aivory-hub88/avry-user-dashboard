/**
 * Pending tool-call approvals across every agent this user has deployed —
 * Cerveau's F-1 hard-floor gate surfaced in the dashboard. Backend:
 * avry-backend /api/v1/agent-approvals (JWT), which itself proxies the
 * Cerveau gateway's tenant-scoped GET/POST /webhook/approvals endpoints.
 *
 * Mirrors agentToolScope.ts's shape/conventions exactly.
 */

import { authedFetch } from './deployAuth'
import { APP_CATALOG } from './integrations/store'

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || 'https://backend.aivory.id'

/**
 * A second opinion attached to a pending approval by Cerveau's
 * `verifier_brain` sweep (ADR-008 Phase 3a), so the person deciding sees an
 * assessment rather than only a tool name and an argument blob.
 *
 * Strictly advisory. The verifier runs with zero tools and cannot resolve
 * any approval — `verdict: "ok"` means "an automated check found nothing
 * unusual", never "this is approved". The human decision is unchanged.
 *
 * `error` is a real, expected verdict, not a bug: the sweep folds every
 * failure (spawn refused, LLM call failed, unparseable reply) into one so a
 * row always carries something visible rather than silently staying blank.
 */
export interface VerifierFinding {
  verdict: 'ok' | 'flag' | 'error'
  reasoning: string
  confidence: number
}

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
  /** `null` both when the sweep hasn't reached this row yet and when
   *  `verifier_brain` isn't configured at all — the gateway deliberately
   *  collapses those cases, since neither gives the caller anything to
   *  show. Absent entirely on an older Cerveau that predates the column. */
  verifier_finding?: VerifierFinding | null
  /** ADR-009 Phase 3: true when this approval was raised by a scheduled
   *  run rather than a live conversation — nobody is blocked waiting for
   *  the decision. Derived by Cerveau from the session the run actually
   *  wrote, not by matching a string here. Absent on an older Cerveau that
   *  predates the field, which reads the same as `false`: a missing badge
   *  costs nothing, whereas telling someone nobody is waiting when someone
   *  is costs them the wait. */
  unattended?: boolean
  /** What the turn was originally asked to do — for a scheduled run, the
   *  tenant's own schedule instruction. `null` on a row that predates the
   *  capture, and on any turn whose origin was never recorded. */
  origin_message?: string | null
  /** Present on rows returned by the list endpoint — required to resolve
   *  without avry-backend re-scanning every (instance, agent_type) pair. */
  _gateway_base?: string
  _agent_type?: string
}

/** Narrow an unknown `verifier_finding` to something safe to render.
 *
 *  The value crosses two service boundaries and originates from a model
 *  summarising *untrusted tool arguments*, so nothing about its shape is
 *  guaranteed by the time it reaches here — a malformed or partial object
 *  must render as "no finding", never as a crash or a half-drawn chip. */
export function readVerifierFinding(approval: PendingApproval): VerifierFinding | null {
  const f = approval.verifier_finding
  if (!f || typeof f !== 'object') return null
  const verdict = (f as VerifierFinding).verdict
  if (verdict !== 'ok' && verdict !== 'flag' && verdict !== 'error') return null
  const reasoning = (f as VerifierFinding).reasoning
  return {
    verdict,
    reasoning: typeof reasoning === 'string' ? reasoning : '',
    confidence: typeof (f as VerifierFinding).confidence === 'number' ? (f as VerifierFinding).confidence : 0,
  }
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

/**
 * The real brand icon for the toolkit a tool call belongs to (Gmail,
 * Slack, whatever Composio toolkit the tool name is prefixed with) — the
 * exact same `/integrations/*.svg` set `APP_CATALOG` already uses
 * everywhere else a connected tool is shown. `null` for a bare loopback
 * tool name (no `__` prefix) or a toolkit not in the catalog — the caller
 * falls back to a generic glyph in that case, never a broken image.
 */
export function toolkitIconPath(toolName: string): string | null {
  if (!toolName.includes('__')) return null
  const slug = toolName.split('__')[0].replace(/^composio-/, '')
  return APP_CATALOG.find((app) => app.id === slug)?.iconPath || null
}
