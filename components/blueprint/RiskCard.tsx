import styles from './RiskCard.module.css'

interface RiskCardProps {
  dataRisks: string[]
  fallbackStrategy: string
}

export default function RiskCard({ dataRisks, fallbackStrategy }: RiskCardProps) {
  return (
    <div className={styles.riskCard}>
      <h3 className={styles.cardTitle}>Risk & Governance</h3>
      
      <div className={styles.section}>
        <div className={styles.sectionLabel}>Data Risks</div>
        <ul className={styles.risksList}>
          {dataRisks.map((risk, index) => (
            <li key={index} className={styles.riskItem}>
              {risk}
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionLabel}>Fallback Strategy</div>
        <p className={styles.strategyText}>{fallbackStrategy}</p>
      </div>
    </div>
  )
}
