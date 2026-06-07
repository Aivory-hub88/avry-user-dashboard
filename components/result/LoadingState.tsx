import styles from './LoadingState.module.css'

export default function LoadingState() {
  return (
    <div className={styles.container} aria-label="Loading diagnostic results…">
      <div className={`${styles.block} ${styles.headerBlock}`} />
      <div className={`${styles.block} ${styles.scorecardBlock}`} />
      <div className={`${styles.block} ${styles.roiBlock}`} />
      <div className={`${styles.block} ${styles.matrixBlock}`} />
      <div className={`${styles.block} ${styles.riskBlock}`} />
      <div className={`${styles.block} ${styles.contextBlock}`} />
    </div>
  )
}
