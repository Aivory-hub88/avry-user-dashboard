import type { DimensionKey, DimensionScores } from '@/types/diagnostic'
import { humanizeDimensionKey } from '@/lib/resultFormatters'
import type { IndustryBenchmark } from '@/lib/industryBenchmarks'
import { BENCHMARK_DISCLAIMER, formatVsMedian } from '@/lib/industryBenchmarks'
import { buildDimensionBenchmarkCaption } from '@/lib/readinessNarrative'
import styles from './DimensionBenchmarkBars.module.css'

const DIMENSION_ORDER: DimensionKey[] = ['strategy', 'data', 'process', 'people', 'governance', 'security']

interface DimensionBenchmarkBarsProps {
  scores: Pick<DimensionScores, 'strategy' | 'data' | 'process' | 'people' | 'governance' | 'security'>
  benchmark: IndustryBenchmark | null | undefined
}

/**
 * Phase E1.1/E2.1 — "vs median" ticks on dimension bars. Renders nothing
 * (not even an empty shell) when there is no benchmark for the user's
 * industry, so old/unmatched contexts fall back to exactly the pre-Phase-E
 * layout — no broken layout, no crash (brief §8 exit gate).
 */
export default function DimensionBenchmarkBars({ scores, benchmark }: DimensionBenchmarkBarsProps) {
  if (!benchmark) return null

  // Phase E2.6 — shared with the PDF's dimension-bar block via the same
  // builder (lib/readinessNarrative.ts) so the "so what" line can never
  // independently drift between the two surfaces.
  const caption = buildDimensionBenchmarkCaption(scores, benchmark)

  return (
    <div className={styles.container}>
      <span className={styles.heading}>Dimensions vs industry median</span>
      {caption && <p className={styles.caption}>{caption}</p>}
      <div className={styles.rows}>
        {DIMENSION_ORDER.map((key) => {
          const score = Math.round(scores[key] ?? 0)
          const point = benchmark[key]
          if (!point) return null
          const vsLabel = formatVsMedian(score, point)
          const medianPct = Math.max(0, Math.min(100, point.median))
          return (
            <div key={key} className={styles.row}>
              <span className={styles.rowLabel}>{humanizeDimensionKey(key)}</span>
              <div className={styles.track}>
                <div className={styles.fill} style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
                <div
                  className={styles.medianTick}
                  style={{ left: `${medianPct}%` }}
                  title={`Industry median: ${Math.round(point.median)}`}
                />
              </div>
              <span className={styles.rowValue}>{vsLabel}</span>
            </div>
          )
        })}
      </div>
      <p className={styles.disclaimer}>{BENCHMARK_DISCLAIMER}</p>
    </div>
  )
}
