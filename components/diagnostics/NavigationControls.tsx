import styles from './NavigationControls.module.css'

interface NavigationControlsProps {
  onPrevious: () => void
  onNext: () => void
  isPreviousDisabled: boolean
  isNextDisabled: boolean
  isLastQuestion: boolean
}

export default function NavigationControls({
  onPrevious,
  onNext,
  isPreviousDisabled,
  isNextDisabled,
  isLastQuestion
}: NavigationControlsProps) {
  return (
    <div className={styles.navigationControls}>
      <button
        type="button"
        onClick={onPrevious}
        disabled={isPreviousDisabled}
        className={`${styles.navButton} ${styles.previousButton}`}
      >
        Previous
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={isNextDisabled}
        className={`${styles.navButton} ${styles.nextButton}`}
      >
        {isLastQuestion ? 'Submit' : 'Next'}
      </button>
    </div>
  )
}
