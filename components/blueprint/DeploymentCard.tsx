import styles from './DeploymentCard.module.css'

interface DeploymentCardProps {
  phase: string
  estimatedImpact: string
  estimatedROIMonths: number
}

export default function DeploymentCard({
  phase,
  estimatedImpact,
  estimatedROIMonths
}: DeploymentCardProps) {
  return (
    <div className={styles.deploymentCard}>
      <h3 className={styles.cardTitle}>Deployment Plan</h3>
      
      <div className={styles.section}>
        <div className={styles.sectionLabel}>Phase</div>
        <p className={styles.phaseText}>{phase}</p>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionLabel}>Estimated Impact</div>
        <p className={styles.impactText}>{estimatedImpact}</p>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionLabel}>Expected ROI</div>
        <div className={styles.roiValue}>
          {estimatedROIMonths} <span className={styles.roiUnit}>months</span>
        </div>
      </div>
    </div>
  )
}
