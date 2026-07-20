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
   * ~2x the supporting cells, so the block reads as one hero figure with
   * supporting metrics rather than a flat grid of equals. Note the cell is
   * borderless in both variants — the hero is distinguished by type size and
   * colour alone, matching the PDF's Financial Case grid.
   */
  variant?: 'default' | 'hero'
}

export default function ROIMetricTile({ label, value, formatter, subtitle, confidenceLevel, variant = 'default' }: ROIMetricTileProps) {
  const confidenceTag = confidenceTileLabel(confidenceLevel)
  const isHero = variant === 'hero'
  return (
    <div className={`${styles.tile} ${isHero ? styles.tileHero : ''}`}>
      <span className={`${styles.label} ${isHero ? styles.labelHero : ''}`}>{label}</span>
      {/* Order is eyebrow → value → sub-caption, matching the PDF's Financial
          Case grid. It also keeps every value on the same baseline across a
          row: with the sub-caption above the value (the previous order), a
          cell that had one pushed its figure a line lower than its
          neighbours', which was invisible inside the old bordered cards but
          obvious once the boxes came off and the rows share a hairline. */}
      {value === null ? (
        <span className={styles.insufficient}>Not provided</span>
      ) : (
        <span className={`${styles.value} ${isHero ? styles.valueHero : ''}`} style={value < 0 ? { color: '#f87171' } : undefined}>
          {formatter(value)}
        </span>
      )}
      {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
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
