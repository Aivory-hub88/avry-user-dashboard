import type { RankedOpportunity } from '@/types/diagnostic'
import { formatCurrency, humanizeQuadrant, type CurrencyCode } from '@/lib/resultFormatters'
import styles from './OpportunityCard.module.css'

interface OpportunityCardProps {
  opportunity: RankedOpportunity
  isHighlighted: boolean
  colorIndex?: number
  currencyCode: CurrencyCode
}

// Must stay in sync with DOT_COLORS in OpportunityMatrix.tsx
const DOT_COLORS = [
  '#00e59e',
  '#60a5fa',
  '#f59e0b',
  '#f472b6',
  '#a78bfa',
  '#34d399',
  '#fb923c',
  '#e879f9',
]

const dataReadinessLabel: Record<string, string> = {
  ready: 'Data Ready',
  needs_prep: 'Needs Data Prep',
  not_ready: 'Data Not Ready',
}

const dataReadinessClass: Record<string, string> = {
  ready: styles.badgeReady,
  needs_prep: styles.badgeNeedsPrep,
  not_ready: styles.badgeNotReady,
}

export default function OpportunityCard({
  opportunity,
  isHighlighted,
  colorIndex = 0,
  currencyCode,
}: OpportunityCardProps) {
  const color = DOT_COLORS[colorIndex % DOT_COLORS.length]
  const cardStyle = isHighlighted
    ? { borderColor: color, boxShadow: `0 0 0 1px ${color}` }
    : {}

  // Use estimatedSavingsLocal (new field); fall back to deprecated estimatedSavingsIDR
  // for contexts stored before this fix was deployed.
  const estimatedSavings =
    opportunity.estimatedSavingsLocal ?? opportunity.estimatedSavingsIDR ?? null
  const savingsLine =
    typeof estimatedSavings === 'number'
      ? `Est. ${formatCurrency(estimatedSavings, currencyCode)}/yr savings`
      : null

  return (
    <div className={styles.card} style={cardStyle}>
      <div className={styles.header}>
        <div className={styles.nameRow}>
          <span className={styles.colorDot} style={{ background: color }} />
          {/* FIX 3: opportunity.name → opportunity.title */}
          <h3 className={styles.name}>{opportunity.title}</h3>
        </div>
        <span className={styles.quadrantBadge}>
          {humanizeQuadrant(opportunity.quadrant)}
        </span>
      </div>

      <div className={styles.metrics}>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Impact</span>
          {/* FIX 4: opportunity.impactScore → opportunity.impact */}
          <span className={styles.metricValue}>{opportunity.impact}/10</span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Effort</span>
          {/* FIX 5: opportunity.effortScore → opportunity.effort */}
          <span className={styles.metricValue}>{opportunity.effort}/10</span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Time to Value</span>
          <span className={styles.metricValue}>{opportunity.timeToValueWeeks}w</span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Complexity</span>
          {/* FIX 6: opportunity.errorComplexity → opportunity.complexity */}
          <span
            className={styles.metricValue}
            style={{ textTransform: 'capitalize' }}
          >
            {opportunity.complexity}
          </span>
        </div>
      </div>

      {/* FIX 2 (lanjutan): Tampilkan savings unik per-kartu */}
      {savingsLine && <p className={styles.roiNote}>{savingsLine}</p>}

      {/* projectedROINote tetap tampil sebagai sub-note jika ada */}
      {opportunity.projectedROINote && (
        <p className={styles.roiSubNote}>{opportunity.projectedROINote}</p>
      )}

      <div className={styles.badges}>
        <span
          className={`${styles.badge} ${
            dataReadinessClass[opportunity.dataReadiness] ?? ''
          }`}
        >
          {dataReadinessLabel[opportunity.dataReadiness] ?? opportunity.dataReadiness}
        </span>
        {/* FIX 7: optional chaining — prerequisites bisa undefined/null */}
        {opportunity.prerequisites?.length > 0 && (
          <span className={styles.badge}>
            Prereqs: {opportunity.prerequisites.join(', ')}
          </span>
        )}
      </div>
    </div>
  )
}