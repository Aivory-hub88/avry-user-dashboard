import type { ROISensitivityLever } from '@/services/deepDiagnostic'
import styles from './ROISensitivityTornado.module.css'

interface ROISensitivityTornadoProps {
  /** From services/deepDiagnostic.ts getROISensitivity(context). */
  sensitivity: ROISensitivityLever[]
  /** The actual assumed value (base case), e.g. Business Value Created at the report's real efficiency factor. */
  baseValueLocal: number | null
  /** The report's actual assumed efficiency, e.g. "75%". */
  baseBoundLabel: string
  formatter: (value: number) => string
}

/**
 * Phase E1.4 — ROI sensitivity tornado. Horizontal bar comparison of
 * Business Value Created at each lever's low/high bound, with the base
 * case marked. Lightweight inline-CSS bars, matching the hand-rolled
 * pattern used by DimensionBenchmarkBars/HistorySparkline/RadarChart
 * rather than pulling in a charting library. Display-only — reads
 * `sensitivity` computed alongside `calculateROI`, never writes anything.
 */
export default function ROISensitivityTornado({
  sensitivity,
  baseValueLocal,
  baseBoundLabel,
  formatter,
}: ROISensitivityTornadoProps) {
  if (!Array.isArray(sensitivity) || sensitivity.length === 0) return null

  return (
    <div className={styles.container}>
      <span className={styles.heading}>Which assumption moves this number most</span>
      <div className={styles.rows}>
        {sensitivity.map((lever) => {
          if (lever.lowValueLocal === null || lever.highValueLocal === null) return null
          const min = Math.min(lever.lowValueLocal, lever.highValueLocal)
          const max = Math.max(lever.lowValueLocal, lever.highValueLocal)
          const range = max - min || 1
          const basePct = baseValueLocal !== null
            ? Math.max(0, Math.min(100, ((baseValueLocal - min) / range) * 100))
            : null

          return (
            <div key={lever.key} className={styles.row}>
              <span className={styles.rowLabel}>{lever.label}</span>
              <div className={styles.track}>
                <div className={styles.fill} />
                {basePct !== null && (
                  <div
                    className={styles.baseTick}
                    style={{ left: `${basePct}%` }}
                    title={`Base case: ${formatter(baseValueLocal as number)} at ${baseBoundLabel}`}
                  />
                )}
              </div>
              <div className={styles.endLabels}>
                <span className={styles.endLabelLow}>
                  {formatter(lever.lowValueLocal)}
                  <span className={styles.endLabelBound}> at {lever.lowBoundLabel}</span>
                </span>
                <span className={styles.endLabelHigh}>
                  {formatter(lever.highValueLocal)}
                  <span className={styles.endLabelBound}> at {lever.highBoundLabel}</span>
                </span>
              </div>
            </div>
          )
        })}
      </div>
      <p className={styles.disclaimer}>
        Sensitivity is computed by re-evaluating the same Business Value Created formula at the efficiency
        factor&apos;s scenario bounds ({sensitivity[0]?.lowBoundLabel}–{sensitivity[0]?.highBoundLabel}); other
        formula inputs (hourly rate, automation gap) are fixed for this assessment and not swept, since the
        methodology does not define alternate bounds for them.
      </p>
    </div>
  )
}
