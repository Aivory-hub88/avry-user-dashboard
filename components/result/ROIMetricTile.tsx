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
  /**
   * C2 — hero treatment for the ONE dominant metric of the Financial Case
   * (Business Value Created). Spans the grid full-width and renders the value
   * far larger than the supporting tiles, so the block reads as one hero
   * figure with supporting metrics rather than a flat grid of equals.
   */
  variant?: 'default' | 'hero'
}

export default function ROIMetricTile({ label, value, formatter, subtitle, confidenceLevel, variant = 'default' }: ROIMetricTileProps) {
  const confidenceTag = confidenceTileLabel(confidenceLevel)
  const isHero = variant === 'hero'
  return (
    <div className={`${styles.tile} ${isHero ? styles.tileHero : ''}`}>
      <span className={`${styles.label} ${isHero ? styles.labelHero : ''}`}>{label}</span>
      {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
      {value === null ? (
        <span className={styles.insufficient}>Insufficient data</span>
      ) : (
        <span className={`${styles.value} ${isHero ? styles.valueHero : ''}`} style={value < 0 ? { color: '#f87171' } : undefined}>
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
