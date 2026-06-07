import styles from './DeepVsFreeComparison.module.css'

const deepFeatures = [
  '4-phase comprehensive assessment',
  'Detailed open-ended questions',
  '5-dimension scoring',
  'Personalized narrative analysis',
  'Full recommendations roadmap',
]

const freeFeatures = [
  '12 quick questions',
  'AI-powered scoring',
  'Strengths & blockers',
  'Opportunities',
  'Blueprint generation',
]

const commonFeatures = [
  'AI-powered scoring',
  'Recommendations',
  'Blueprint generation',
]

export default function DeepVsFreeComparison() {
  return (
    <section className={styles.section}>
      <h2 className={styles.title}>Deep vs Free Diagnostic</h2>

      <div className={styles.columns}>
        {/* Deep Diagnostic column */}
        <div className={`${styles.card} ${styles.deepCard}`}>
          <div className={styles.cardHeader}>
            <span className={styles.cardName}>Deep Diagnostic</span>
            <span className={`${styles.badge} ${styles.deepBadge}`}>Deep</span>
          </div>
          <ul className={styles.featureList}>
            {deepFeatures.map((feature) => (
              <li key={feature} className={styles.featureItem}>
                <span className={`${styles.checkmark} ${styles.deepCheckmark}`}>✓</span>
                <span className={styles.featureText}>{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Free Diagnostic column */}
        <div className={`${styles.card} ${styles.freeCard}`}>
          <div className={styles.cardHeader}>
            <span className={styles.cardName}>Free Diagnostic</span>
            <span className={`${styles.badge} ${styles.freeBadge}`}>Free</span>
          </div>
          <ul className={styles.featureList}>
            {freeFeatures.map((feature) => (
              <li key={feature} className={styles.featureItem}>
                <span className={`${styles.checkmark} ${styles.freeCheckmark}`}>✓</span>
                <span className={styles.featureText}>{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Common features */}
      <div className={styles.commonSection}>
        <h3 className={styles.commonTitle}>Common to Both</h3>
        <ul className={styles.commonList}>
          {commonFeatures.map((feature) => (
            <li key={feature} className={styles.commonItem}>
              <span className={styles.commonCheckmark}>✓</span>
              <span className={styles.featureText}>{feature}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
