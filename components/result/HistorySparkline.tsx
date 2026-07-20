import styles from './HistorySparkline.module.css'

interface HistorySparklineProps {
  /** Chronological (oldest → newest) composite scores, 0–100. */
  series: number[]
}

const WIDTH = 160
const HEIGHT = 36
const PAD_X = 4
const PAD_Y = 4

/**
 * Phase E1.3/E2.3 — minimal inline-SVG sparkline of composite score over
 * time, mirroring the lightweight hand-rolled-SVG pattern used by
 * RadarChart/DimensionBenchmarkBars rather than pulling in a charting
 * library. Renders nothing below 2 points — a single dot isn't a trend and
 * the caller (final-result page) already gates the whole history block on
 * ≥2 rows, but this component stays defensive on its own too.
 */
export default function HistorySparkline({ series }: HistorySparklineProps) {
  if (!Array.isArray(series) || series.length < 2) return null

  const min = Math.min(...series)
  const max = Math.max(...series)
  // Flat series (every save scored the same) → draw a flat mid-height line
  // instead of dividing by zero.
  const range = max - min || 1

  const points = series.map((value, i) => {
    const x = PAD_X + (i / (series.length - 1)) * (WIDTH - PAD_X * 2)
    const y = HEIGHT - PAD_Y - ((value - min) / range) * (HEIGHT - PAD_Y * 2)
    return { x, y }
  })

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const last = points[points.length - 1]

  return (
    <div className={styles.container}>
      <svg
        className={styles.svg}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`Composite score trend across last ${series.length} assessments, from ${series[0]} to ${series[series.length - 1]}`}
      >
        <path d={path} className={styles.line} fill="none" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={i === points.length - 1 ? 2.5 : 1.5} className={styles.dot} />
        ))}
      </svg>
      <span className={styles.caption}>Last {series.length} assessments · latest {last ? Math.round(series[series.length - 1]) : '—'}</span>
    </div>
  )
}
