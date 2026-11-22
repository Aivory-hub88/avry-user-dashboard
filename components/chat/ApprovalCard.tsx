'use client'

/**
 * Approve / Deny card under an agent's chat bubble, like a permission prompt
 * in a coding agent: what the agent wants to do, then two buttons. It sits
 * next to — not instead of — the conversational path (replying "Ya") and the
 * rail card; all three resolve the same pending approval. Presentational:
 * the decision itself is made by `useChat().decideApproval`.
 */

import { describeTool } from '@/lib/agentApprovals'

export interface ApprovalCardProps {
  toolName: string
  riskTier: string
  outcome?: 'approved' | 'denied' | null
  busy?: boolean
  error?: string | null
  onApprove: () => void
  onDeny: () => void
}

export default function ApprovalCard({ toolName, riskTier, outcome, busy, error, onApprove, onDeny }: ApprovalCardProps) {
  const what = describeTool(toolName)

  if (outcome) {
    return (
      <div className="mt-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-white/60" role="status">
        {outcome === 'approved' ? 'Approved' : 'Denied'}: {what}
      </div>
    )
  }

  return (
    <div className="mt-3 rounded-xl border border-white/[0.12] bg-white/[0.04] px-4 py-3" role="group" aria-label={`Approval needed: ${what}`}>
      <p className="text-xs uppercase tracking-wide text-white/40">Waiting for your decision</p>
      <p className="mt-1 text-sm text-white/90">{what}</p>
      {riskTier === 'irreversible' && (
        <p className="mt-1 text-xs text-amber-300/80">This action can&apos;t be undone once it runs.</p>
      )}
      {error && (
        <p className="mt-2 text-xs text-red-300" role="alert">{error}</p>
      )}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onApprove}
          disabled={busy}
          className="rounded-lg bg-white/90 px-4 py-1.5 text-sm font-medium text-black hover:bg-white disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={onDeny}
          disabled={busy}
          className="rounded-lg border border-white/15 px-4 py-1.5 text-sm text-white/80 hover:bg-white/[0.06] disabled:opacity-50"
        >
          Deny
        </button>
      </div>
    </div>
  )
}
