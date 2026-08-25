import type { RankedOpportunity } from '@/types/diagnostic'
import { formatLocalAmount, humanizeQuadrant, type CurrencyCode } from '@/lib/resultFormatters'
import { buildWhyThisRecommendation } from '@/lib/readinessNarrative'
import styles from './OpportunityCard.module.css'

interface OpportunityCardProps {
  opportunity: RankedOpportunity
  isHighlighted: boolean
  colorIndex?: number
  currencyCode: CurrencyCode
  locale?: 'en' | 'id'
}

// Must stay in sync with DOT_COLORS in OpportunityMatrix.tsx
const DOT_COLORS = [
  '#b7cba6',
  '#60a5fa',
  '#f59e0b',
  '#f472b6',
  '#a78bfa',
  '#34d399',
  '#fb923c',
  '#e879f9',
]

const dataReadinessLabel: Record<'en' | 'id', Record<string, string>> = {
  en: { ready: 'Data Ready', needs_prep: 'Needs Data Prep', not_ready: 'Data Not Ready' },
  id: { ready: 'Data Siap', needs_prep: 'Perlu Persiapan Data', not_ready: 'Data Belum Siap' },
}

const complexityLabel: Record<'en' | 'id', Record<string, string>> = {
  en: { low: 'low', medium: 'medium', high: 'high' },
  id: { low: 'rendah', medium: 'sedang', high: 'tinggi' },
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
  locale = 'en',
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
      ? (locale === 'id'
        ? `Estimasi penghematan ${formatLocalAmount(estimatedSavings, currencyCode)}/tahun`
        : `Est. ${formatLocalAmount(estimatedSavings, currencyCode)}/yr savings`)
      : null

  // Phase 2.1 — "Why This Recommendation": every input is already a field on
  // this opportunity, this only rephrases them as a short reason list.
  const whyReasons = buildWhyThisRecommendation({
    quadrant: opportunity.quadrant,
    complexity: opportunity.complexity,
    dataReadiness: opportunity.dataReadiness,
    timeToValueWeeks: opportunity.timeToValueWeeks,
    prerequisites: opportunity.prerequisites ?? [],
  }, locale)

  return (
    <div className={styles.card} style={cardStyle}>
      <div className={styles.header}>
        <div className={styles.nameRow}>
          <span className={styles.colorDot} style={{ background: color }} />
          {/* FIX 3: opportunity.name → opportunity.title */}
          <h3 className={styles.name}>{opportunity.title}</h3>
        </div>
        <span className={styles.quadrantBadge}>
          {humanizeQuadrant(opportunity.quadrant, locale)}
        </span>
      </div>

      <div className={styles.metrics}>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>{locale === 'id' ? 'Dampak' : 'Impact'}</span>
          {/* FIX 4: opportunity.impactScore → opportunity.impact */}
          <span className={styles.metricValue}>{opportunity.impact}/10</span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>{locale === 'id' ? 'Usaha' : 'Effort'}</span>
          {/* FIX 5: opportunity.effortScore → opportunity.effort */}
          <span className={styles.metricValue}>{opportunity.effort}/10</span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>{locale === 'id' ? 'Waktu ke Value' : 'Time to Value'}</span>
          <span className={styles.metricValue}>{opportunity.timeToValueWeeks}{locale === 'id' ? ' minggu' : 'w'}</span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>{locale === 'id' ? 'Kompleksitas' : 'Complexity'}</span>
          {/* FIX 6: opportunity.errorComplexity → opportunity.complexity */}
          <span
            className={styles.metricValue}
            style={{ textTransform: 'capitalize' }}
          >
            {complexityLabel[locale][opportunity.complexity] ?? opportunity.complexity}
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
          {dataReadinessLabel[locale][opportunity.dataReadiness] ?? opportunity.dataReadiness}
        </span>
        {/* FIX 7: optional chaining — prerequisites bisa undefined/null */}
        {opportunity.prerequisites?.length > 0 && (
          <span className={styles.badge}>
            {locale === 'id' ? 'Prasyarat: ' : 'Prereqs: '}{opportunity.prerequisites.join(', ')}
          </span>
        )}
        {opportunity.recommendedAgent && (
          <span className={`${styles.badge} ${styles.badgeAgent}`}>
            {locale === 'id' ? 'Agen Aivory: ' : 'Aivory agent: '}{opportunity.recommendedAgent.title}
          </span>
        )}
      </div>

      {/* What the badge above actually does and connects to — a bare agent
          name doesn't tell the reader what it runs or what it plugs into. */}
      {opportunity.recommendedAgent && (
        <div className={styles.agentDetail}>
          <span>{opportunity.recommendedAgent.description}</span>
          {opportunity.recommendedAgent.integrations.length > 0 && (
            <span>
              {locale === 'id' ? 'Terhubung ke: ' : 'Connects to: '}
              {opportunity.recommendedAgent.integrations.join(', ')}
            </span>
          )}
        </div>
      )}

      {whyReasons.length > 0 && (
        <p className={styles.whyLine}>
          <span className={styles.whyLabel}>{locale === 'id' ? 'Mengapa ini: ' : 'Why this: '}</span>
          {whyReasons.join(' · ')}
        </p>
      )}

      {opportunity.trainingTracks && opportunity.trainingTracks.length > 0 && (
        <div className={styles.trainingBlock}>
          {opportunity.trainingTracks.map((track) => (
            <div key={track.audience} className={styles.trainingTrack}>
              {/* Topic leads, audience second — "{headline} for {audience}"
                  reads as "here's what this covers", not "here's who attends". */}
              <span className={styles.trainingAudience}>
                {locale === 'id' ? `${track.headline} untuk ${track.audience}` : `${track.headline} for ${track.audience}`}
              </span>
              {track.topics.length > 0 && (
                <span className={styles.trainingDetail}>{track.topics.join(', ')}</span>
              )}
              {track.tools.length > 0 && (
                <span className={styles.trainingDetail}>
                  {locale === 'id' ? 'Tool: ' : 'Tools: '}
                  {track.tools.join(', ')}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}