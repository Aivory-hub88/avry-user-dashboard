import type { DiagnosticDelta } from '@/lib/diagnosticHistory'
import styles from './DeltaChip.module.css'

interface DeltaChipProps {
  delta: DiagnosticDelta | null
}

/**
 * Phase E2.3 — "▲ +8 since 12 Mar 2026" header chip. Renders nothing when
 * there's no delta to show (fewer than 2 history rows, or the score hasn't
 * moved) so the header looks exactly as it does today for every user who
 * hasn't got history yet — same graceful-degradation contract as
 * DimensionBenchmarkBars (E1.1).
 */
export default function DeltaChip({ delta }: DeltaChipProps) {
  if (!delta) return null

  const isUp = delta.direction === 'up'
  const arrow = isUp ? '▲' : '▼'
  const magnitude = Math.abs(delta.delta)

  return (
    <span className={`${styles.chip} ${isUp ? styles.up : styles.down}`}>
      <span className={styles.arrow}>{arrow}</span>
      {isUp ? '+' : '-'}{magnitude} since {delta.sinceLabel}
    </span>
  )
}
