'use client'

import { useEffect, useState } from 'react'
import { ThinkingDots } from '@/components/ui/ThinkingDots'

/**
 * Live "what is the agent doing" line: dots + shimmering activity label +
 * elapsed timer, e.g. "Lex is reading the room · 12s".
 */

export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return `${m}m ${String(s % 60).padStart(2, '0')}s`
}

/** Task `reason` written by the runner → what to show. Unknown reasons fall back to "thinking". */
export function activityLabel(status: string, reason: string, agentName: string): string {
  if (status === 'todo') return `${agentName} is next in line`
  const r = reason.toLowerCase()
  if (r.startsWith('reading')) return `${agentName} is reading the room`
  if (r.startsWith('tool:')) return `${agentName} is using ${reason.slice(5).trim() || 'a tool'}`
  if (r.startsWith('writing')) return `${agentName} is writing a reply`
  if (r.startsWith('handing')) return `${agentName} is handing work over`
  return `${agentName} is thinking`
}

export function AgentActivity({
  label,
  startedAt,
  size = 16,
  dotSize = 2.5,
}: {
  label: string
  /** epoch ms the turn started; omit to hide the timer */
  startedAt?: number
  size?: number
  dotSize?: number
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (startedAt === undefined) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [startedAt])

  return (
    <div className="flex items-center gap-2.5" role="status" aria-live="polite">
      <ThinkingDots size={size} dotSize={dotSize} />
      <span key={label} className="activity-shimmer activity-enter text-sm">{label}…</span>
      {startedAt !== undefined && (
        <span className="text-[12px] tabular-nums text-white/35">{formatElapsed(now - startedAt)}</span>
      )}
    </div>
  )
}
