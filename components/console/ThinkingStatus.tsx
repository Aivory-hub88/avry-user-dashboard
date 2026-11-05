'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { formatElapsed } from '@/lib/agentActivity'
import { ThinkingOrbit } from './ThinkingOrbit'

/**
 * "Thinking" status for regular (non-agent) console rooms, modelled on the Claude app's
 * turn-status row: an orbiting-dots mark (3D, depth by size), the label with a light
 * sweeping across its letters, and a live elapsed-time counter. White on the dark surface.
 *
 * Shimmer follows Claude Code's logic: the char at the glimmer index and its two
 * neighbours are bright, the rest dim; the index advances every 50 ms over len + 20 steps.
 */

const BASE = 'rgba(255,255,255,0.55)'
const SHIMMER = '#ffffff'
const SHIMMER_MS = 50

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)'

function subscribeReduced(onChange: () => void): () => void {
  const mq = window.matchMedia(REDUCED_QUERY)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => false,
  )
}

interface ThinkingStatusProps {
  /** Text next to the mark. Defaults to "Thinking…"; tool statuses can override it. */
  label?: string
  /** Epoch ms the turn began. Defaults to when this component mounted. */
  startedAt?: number
  /** Smaller version for the compact/side-panel chat. */
  compact?: boolean
}

export function ThinkingStatus({ label = 'Thinking…', startedAt, compact = false }: ThinkingStatusProps) {
  const [start] = useState(() => startedAt ?? Date.now())
  const [t0] = useState(() => Date.now())
  const [now, setNow] = useState(() => Date.now())
  const reduced = usePrefersReducedMotion()

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), reduced ? 1000 : SHIMMER_MS)
    return () => clearInterval(id)
  }, [reduced])

  const chars = Array.from(label)
  const glimmer = Math.floor((now - t0) / SHIMMER_MS) % (chars.length + 20) - 10

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: compact ? 8 : 10,
        fontSize: compact ? 12.5 : 15,
        lineHeight: compact ? '20px' : '26px',
      }}
    >
      <ThinkingOrbit size={compact ? 18 : 24} still={reduced} />
      <span aria-hidden style={{ whiteSpace: 'pre' }}>
        {chars.map((c, i) => (
          <span key={i} style={{ color: !reduced && Math.abs(i - glimmer) <= 1 ? SHIMMER : BASE }}>
            {c}
          </span>
        ))}
      </span>
      <span style={{ color: BASE, fontVariantNumeric: 'tabular-nums' }}>({formatElapsed(now - start)})</span>
    </div>
  )
}
