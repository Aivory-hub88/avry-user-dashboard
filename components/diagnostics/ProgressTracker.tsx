import styles from './ProgressTracker.module.css'

interface ProgressTrackerProps {
  totalPhases: number
  completedPhases: number
  currentPhase: number
}

export default function ProgressTracker({
  totalPhases,
  completedPhases,
  currentPhase
}: ProgressTrackerProps) {
  const percentageComplete = (completedPhases / totalPhases) * 100

  return (
    <div className={styles.progressTracker} role="region" aria-label="Diagnostic progress">
      <div className={styles.progressInfo}>
        <span className={styles.phaseLabel} aria-live="polite">
          Phase {currentPhase} of {totalPhases}
        </span>
        <span className={styles.completionStatus} aria-live="polite">
          {completedPhases}/{totalPhases} phases complete
        </span>
      </div>
      <div 
        className={styles.progressBarContainer} 
        role="progressbar" 
        aria-valuenow={percentageComplete} 
        aria-valuemin={0} 
        aria-valuemax={100} 
        aria-label={`${Math.round(percentageComplete)}% complete`}
      >
        <div 
          className={styles.progressBarFill} 
          style={{ width: `${percentageComplete}%` }}
        />
      </div>
    </div>
  )
}
