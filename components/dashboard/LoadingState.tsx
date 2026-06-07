import styles from "./LoadingState.module.css"

export default function LoadingState() {
  return (
    <div className={styles.loadingState}>
      <div className={styles.spinner} />
      <p className={styles.message}>Loading your dashboard...</p>
    </div>
  )
}
