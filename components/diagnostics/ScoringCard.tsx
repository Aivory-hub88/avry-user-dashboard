import { FreeDiagnosticResult } from '@/types/freeDiagnostic'
import styles from './ScoringCard.module.css'

interface ScoringCardProps {
  result: FreeDiagnosticResult
}

// Helper function to ensure field is always an array
function ensureArray(value: any): string[] {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') return value.split(',').map(s => s.trim()).filter(Boolean)
  return []
}

export default function ScoringCard({ result }: ScoringCardProps) {
  return (
    <div className={styles.scoringCard}>
      <div className={styles.scoreSection}>
        <div className={styles.scoreDisplay}>
          <span className={styles.scoreNumber}>{Math.round(result.score)}</span>
          <span className={styles.scoreOutOf}>/100</span>
        </div>
        <p className={styles.maturityLevel}>Maturity: {result.maturity_level}</p>
      </div>

      <div className={styles.insightsSection}>
        <div className={styles.insightItem}>
          <h4 className={styles.insightLabel}>What's Strong</h4>
          <ul className={styles.insightList}>
            {ensureArray(result.strengths).map((strength, index) => (
              <li key={index}>{strength}</li>
            ))}
          </ul>
        </div>

        <div className={styles.insightItem}>
          <h4 className={styles.insightLabel}>Biggest Blocker</h4>
          <ul className={styles.insightList}>
            {ensureArray(result.blockers).map((blocker, index) => (
              <li key={index}>{blocker}</li>
            ))}
          </ul>
        </div>

        <div className={styles.insightItem}>
          <h4 className={styles.insightLabel}>Biggest Opportunity</h4>
          <ul className={styles.insightList}>
            {ensureArray(result.opportunities).map((opportunity, index) => (
              <li key={index}>{opportunity}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
