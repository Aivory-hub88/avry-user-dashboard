import type { RiskFlag } from '@/types/diagnostic'
import { humanizeRiskSource } from '@/lib/readinessNarrative'
import styles from './RiskCard.module.css'

interface RiskCardProps {
  risk: RiskFlag
  locale?: 'en' | 'id'
}

const severityClass: Record<string, string> = {
  HIGH: styles.high,
  MEDIUM: styles.medium,
  LOW: styles.low,
}

const severityLabel: Record<'en' | 'id', Record<string, string>> = {
  en: { HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW' },
  id: { HIGH: 'TINGGI', MEDIUM: 'SEDANG', LOW: 'RENDAH' },
}

export default function RiskCard({ risk, locale = 'en' }: RiskCardProps) {
  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <span className={`${styles.severityBadge} ${severityClass[risk.severity] ?? styles.low}`}>
          {severityLabel[locale][risk.severity] ?? risk.severity}
        </span>
        {!risk.detected && (
          <span className={styles.inferredBadge}>{locale === 'id' ? 'Disimpulkan dari data' : 'Inferred from data'}</span>
        )}
      </div>
      <p className={styles.description}>{risk.risk}</p>
      <span className={styles.source}>{locale === 'id' ? 'Sinyal: ' : 'Signal: '}{humanizeRiskSource(risk.source, locale)}</span>
    </div>
  )
}
