import styles from './DiagnosticSummary.module.css'

interface DiagnosticSummaryProps {
  score: number
  maturityLevel: string
  onGenerateBlueprint: () => void
}

export default function DiagnosticSummary({ 
  score, 
  maturityLevel, 
  onGenerateBlueprint 
}: DiagnosticSummaryProps) {
  return (
    <div className={styles.summaryCard}>
      <h2 className={styles.summaryTitle}>Diagnostic Summary</h2>
      
      <div className={styles.summaryContent}>
        <div className={styles.scoreSection}>
          <div className={styles.scoreValue}>{score}</div>
          <div className={styles.scoreLabel}>Operational Health Score</div>
        </div>

        <div className={styles.maturitySection}>
          <div className={styles.maturityLabel}>Maturity Level</div>
          <div className={styles.maturityBadge}>{maturityLevel}</div>
        </div>
      </div>

      <div className={styles.ctaSection}>
        <p className={styles.ctaText}>
          Based on your responses, we can generate a customized Transformation Blueprint for your organization.
        </p>
        <button 
          className={styles.ctaButton}
          onClick={onGenerateBlueprint}
        >
          Generate Transformation Blueprint
        </button>
      </div>
    </div>
  )
}
