import styles from './LoadingState.module.css'

interface LoadingStateProps {
  locale?: 'en' | 'id'
}

export default function LoadingState({ locale = 'en' }: LoadingStateProps) {
  return (
    <div className={styles.container} aria-label={locale === 'id' ? 'Memuat hasil diagnostik…' : 'Loading diagnostic results…'}>
      <div className={`${styles.block} ${styles.headerBlock}`} />
      <div className={`${styles.block} ${styles.scorecardBlock}`} />
      <div className={`${styles.block} ${styles.roiBlock}`} />
      <div className={`${styles.block} ${styles.matrixBlock}`} />
      <div className={`${styles.block} ${styles.riskBlock}`} />
      <div className={`${styles.block} ${styles.contextBlock}`} />
    </div>
  )
}
