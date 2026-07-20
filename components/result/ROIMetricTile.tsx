import styles from './ROIMetricTile.module.css'
import { confidenceTileLabel } from '@/lib/readinessNarrative'

interface ROIMetricTileProps {
  label: string
  value: number | null
  formatter: (value: number) => string
  subtitle?: string
  /**
   * E1.7 — evidence strength. Pass calculations.confidenceLevel for tiles
   * whose figures depend on how many financial inputs were provided. Omit
   * for tiles with no such dependency. Renders nothing at 'high' confidence.
   */
  confidenceLevel?: 'low' | 'medium' | 'high' | null
}

export default function ROIMetricTile({ label, value, formatter, subtitle, confidenceLevel }: ROIMetricTileProps) {
  const confidenceTag = confidenceTileLabel(confidenceLevel)
  return (
    <div className={styles.tile}>
      <span className={styles.label}>{label}</span>
      {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
      {value === null ? (
        <span className={styles.insufficient}>Insufficient data</span>
      ) : (
        <span className={styles.value} style={value < 0 ? { color: '#f87171' } : undefined}>
          {formatter(value)}
        </span>
      )}
      {confidenceTag && (
        <span
          className={`${styles.confidenceTag} ${confidenceLevel === 'low' ? styles.confidenceTagLow : styles.confidenceTagMedium}`}
        >
          {confidenceTag}
        </span>
      )}
    </div>
  )
}
