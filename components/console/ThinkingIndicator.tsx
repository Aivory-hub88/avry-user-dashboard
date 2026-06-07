import styles from './ThinkingIndicator.module.css'

export default function ThinkingIndicator() {
  return (
    <div className={styles.thinkingIndicator}>
      <div className={styles.thinkingDot}></div>
      <div className={styles.thinkingDot}></div>
      <div className={styles.thinkingDot}></div>
    </div>
  )
}
