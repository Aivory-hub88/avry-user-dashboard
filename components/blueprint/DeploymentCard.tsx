import { useTranslations } from 'next-intl'
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
  const t = useTranslations("blueprint")
  return (
    <div className={styles.deploymentCard}>
      <h3 className={styles.cardTitle}>{t("deploymentPlanTitle")}</h3>

      <div className={styles.section}>
        <div className={styles.sectionLabel}>{t("phaseLabel")}</div>
        <p className={styles.phaseText}>{phase}</p>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionLabel}>{t("estimatedImpactLabel")}</div>
        <p className={styles.impactText}>{estimatedImpact}</p>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionLabel}>{t("expectedRoiLabel")}</div>
        <div className={styles.roiValue}>
          {estimatedROIMonths} <span className={styles.roiUnit}>{t("monthsUnit")}</span>
        </div>
      </div>
    </div>
  )
}
