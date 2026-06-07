import styles from './ExecutiveSummary.module.css'

interface ExecutiveSummaryProps {
  primaryGoal: string
  readinessScore: number
  maturityLevel: string
  constraints: string[]
}

export default function ExecutiveSummary({
  primaryGoal,
  readinessScore,
  maturityLevel,
  constraints
}: ExecutiveSummaryProps) {
  return (
    <div className={styles.summaryCard}>
      <h2 className={styles.sectionTitle}>Executive Summary</h2>
      
      <div className={styles.goalSection}>
        <h3 className={styles.goalLabel}>Strategic Objective</h3>
        <p className={styles.goalText}>{primaryGoal}</p>
      </div>

      <div className={styles.metricsRow}>
        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>AI Readiness Score</div>
          <div className={styles.metricValue}>{readinessScore}</div>
        </div>
        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>Maturity Level</div>
          <div className={styles.metricBadge}>{maturityLevel}</div>
        </div>
      </div>

      <div className={styles.constraintsSection}>
        <h3 className={styles.constraintsLabel}>Primary Constraints</h3>
        <ul className={styles.constraintsList}>
          {constraints.map((constraint, index) => (
            <li key={index} className={styles.constraintItem}>
              {constraint}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
