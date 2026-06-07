import type { RiskFlag } from '@/types/diagnostic'
import styles from './RiskCard.module.css'

interface RiskCardProps {
  risk: RiskFlag
}

const severityClass: Record<string, string> = {
  HIGH: styles.high,
  MEDIUM: styles.medium,
  LOW: styles.low,
}

export default function RiskCard({ risk }: RiskCardProps) {
  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <span className={`${styles.severityBadge} ${severityClass[risk.severity] ?? styles.low}`}>
          {risk.severity}
        </span>
        {!risk.detected && (
          <span className={styles.inferredBadge}>Inferred from data</span>
        )}
      </div>
      <p className={styles.description}>{risk.risk}</p>
      <span className={styles.source}>Source: {risk.source}</span>
    </div>
  )
}
