import Link from 'next/link'
import styles from './WorkflowCard.module.css'

interface WorkflowCardProps {
  name: string
  trigger: string
  steps: string[]
  integrations: string[]
}

export default function WorkflowCard({
  name,
  trigger,
  steps,
  integrations
}: WorkflowCardProps) {
  const displaySteps = steps.length > 5 ? steps.slice(0, 5) : steps
  const hasMoreSteps = steps.length > 5

  return (
    <div className={styles.workflowCard}>
      <h3 className={styles.workflowName}>{name}</h3>
      
      <div className={styles.triggerSection}>
        <div className={styles.triggerLabel}>Trigger</div>
        <div className={styles.triggerText}>{trigger}</div>
      </div>

      <div className={styles.stepsSection}>
        <div className={styles.stepsLabel}>Steps</div>
        <ol className={styles.stepsList}>
          {displaySteps.map((step, index) => (
            <li key={index} className={styles.stepItem}>
              {step}
            </li>
          ))}
        </ol>
        {hasMoreSteps && (
          <div className={styles.moreSteps}>
            +{steps.length - 5} more steps
          </div>
        )}
      </div>

      <div className={styles.integrationsSection}>
        <div className={styles.integrationsLabel}>Integrations</div>
        <div className={styles.integrationsContainer}>
          {integrations.map((integration, index) => (
            <div key={index} className={styles.integrationChip}>
              {integration}
            </div>
          ))}
        </div>
      </div>

      <div className={styles.actionsRow}>
        <button className={styles.actionButton} disabled>
          Edit
        </button>
        <button className={styles.actionButton} disabled>
          Simulate
        </button>
        <Link href="/workflows" className={styles.primaryButton}>
          Deploy
        </Link>
      </div>
    </div>
  )
}
