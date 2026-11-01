'use client'

import { useEffect, useState } from 'react'
import { formatElapsed, type ActivityStep } from '@/lib/agentActivity'

interface AgentActivityProps {
  agentName: string
  startedAt: number
  steps: ActivityStep[]
  /** Set once the turn is over; shows a collapsed summary instead of the live panel. */
  endedAt?: number
}

const VISIBLE_STEPS = 6

/** Ticks once per second while `active`, so the timer moves even when no event arrives. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [active])
  return now
}

function StepRow({ step, now }: { step: ActivityStep; now: number }) {
  const running = step.status === 'running'
  const ms = (step.endedAt ?? now) - step.startedAt
  return (
    <li className="flex items-center gap-2 text-[13px] leading-6 text-[#a1a1aa]">
      {running ? (
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#34d399]" aria-hidden />
      ) : (
        <span className="text-[#34d399]" aria-hidden>✓</span>
      )}
      <span className={running ? 'text-[#f7f7f7]' : ''}>{step.label}</span>
      <span className="tabular-nums text-[#71717a]">{formatElapsed(ms)}</span>
    </li>
  )
}

export function AgentActivity({ agentName, startedAt, steps, endedAt }: AgentActivityProps) {
  const live = endedAt === undefined
  const now = useNow(live)

  if (!live) {
    // Finished turn: one quiet line, steps one click away.
    const total = formatElapsed(endedAt - startedAt)
    if (steps.length === 0) {
      return <div className="mb-2 text-[12px] text-[#71717a]">Selesai dalam {total}</div>
    }
    return (
      <details className="mb-2 text-[12px] text-[#71717a]">
        <summary className="cursor-pointer select-none">
          Selesai dalam {total} · {steps.length} langkah
        </summary>
        <ul className="mt-1.5 space-y-0.5 border-l border-line pl-3">
          {steps.map((s) => <StepRow key={s.id} step={s} now={endedAt} />)}
        </ul>
      </details>
    )
  }

  const hidden = Math.max(0, steps.length - VISIBLE_STEPS)
  const recent = steps.slice(-VISIBLE_STEPS)
  return (
    <div className="mb-3" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-sm text-[#a1a1aa]">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#34d399]" aria-hidden />
        <span>{agentName} sedang bekerja…</span>
        <span className="tabular-nums text-[#71717a]">{formatElapsed(now - startedAt)}</span>
      </div>
      {steps.length === 0 ? (
        <div className="mt-1.5 pl-4 text-[13px] text-[#71717a]">Menyiapkan jawaban…</div>
      ) : (
        <ul className="mt-1.5 space-y-0.5 border-l border-line pl-3">
          {hidden > 0 && <li className="text-[12px] text-[#71717a]">+{hidden} langkah sebelumnya</li>}
          {recent.map((s) => <StepRow key={s.id} step={s} now={now} />)}
        </ul>
      )}
    </div>
  )
}
