import styles from './ProgressIndicator.module.css'

interface ProgressIndicatorProps {
  currentQuestion: number
  totalQuestions: number
}

export default function ProgressIndicator({
  currentQuestion,
  totalQuestions
}: ProgressIndicatorProps) {
  const percentage = (currentQuestion / totalQuestions) * 100

  return (
    <div className={styles.progressContainer} role="progressbar" aria-valuenow={percentage} aria-valuemin={0} aria-valuemax={100}>
      <div className={styles.progressBar} aria-hidden="true">
        <div 
          className={styles.progressFill} 
          style={{ width: `${percentage}%` }}
        />
      </div>
      <p className={styles.progressText} aria-live="polite">
        Question {currentQuestion} of {totalQuestions}
      </p>
    </div>
  )
}
