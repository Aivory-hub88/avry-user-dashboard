import styles from "./ErrorState.module.css"

interface ErrorStateProps {
  message?: string
  onRetry?: () => void
}

export default function ErrorState({ 
  message = "Failed to load dashboard data", 
  onRetry 
}: ErrorStateProps) {
  return (
    <div className={styles.errorState}>
      <div className={styles.errorIcon}>!</div>
      <h3 className={styles.title}>Something went wrong</h3>
      <p className={styles.message}>{message}</p>
      {onRetry && (
        <button onClick={onRetry} className={styles.retryButton}>
          Try Again
        </button>
      )}
    </div>
  )
}
