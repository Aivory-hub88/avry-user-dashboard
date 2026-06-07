import { PhaseConfig, PhaseId } from '@/types/deepDiagnostic'
import styles from './PhaseNavigator.module.css'

interface PhaseNavigatorProps {
  phases: PhaseConfig[]
  currentPhase: PhaseId
  completedPhases: PhaseId[]
  onNavigate: (phaseId: PhaseId) => void
}

export default function PhaseNavigator({
  phases,
  currentPhase,
  completedPhases,
  onNavigate
}: PhaseNavigatorProps) {
  const getPhaseStatus = (phaseId: PhaseId): 'completed' | 'current' | 'locked' | 'available' => {
    if (completedPhases.includes(phaseId)) {
      return 'completed'
    }
    if (phaseId === currentPhase) {
      return 'current'
    }
    
    // Check if all previous phases are completed
    const phaseIndex = phases.findIndex(p => p.id === phaseId)
    const allPreviousCompleted = phases
      .slice(0, phaseIndex)
      .every(p => completedPhases.includes(p.id))
    
    return allPreviousCompleted ? 'available' : 'locked'
  }

  const canNavigate = (phaseId: PhaseId): boolean => {
    const status = getPhaseStatus(phaseId)
    return status === 'completed' || status === 'available' || status === 'current'
  }

  const handlePhaseClick = (phaseId: PhaseId) => {
    if (canNavigate(phaseId)) {
      onNavigate(phaseId)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent, phaseId: PhaseId) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handlePhaseClick(phaseId)
    }
  }

  return (
    <nav className={styles.phaseNavigator} aria-label="Diagnostic phases">
      <div className={styles.phaseList}>
        {phases.map((phase, index) => {
          const status = getPhaseStatus(phase.id)
          const isNavigable = canNavigate(phase.id)
          const isCurrent = phase.id === currentPhase

          return (
            <div
              key={phase.id}
              className={`${styles.phaseItem} ${styles[status]}`}
              onClick={() => handlePhaseClick(phase.id)}
              onKeyDown={(e) => handleKeyDown(e, phase.id)}
              role="button"
              tabIndex={isNavigable ? 0 : -1}
              aria-label={`Phase ${index + 1}: ${phase.title}`}
              aria-current={isCurrent ? 'step' : undefined}
              aria-disabled={!isNavigable}
            >
              <div className={styles.phaseNumber}>
                {status === 'completed' ? (
                  <svg
                    className={styles.checkIcon}
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  <span>{index + 1}</span>
                )}
              </div>
              <div className={styles.phaseContent}>
                <h3 className={styles.phaseTitle}>{phase.title}</h3>
                <p className={styles.phaseDescription}>{phase.description}</p>
              </div>
              {status === 'locked' && (
                <svg
                  className={styles.lockIcon}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </div>
          )
        })}
      </div>
    </nav>
  )
}
