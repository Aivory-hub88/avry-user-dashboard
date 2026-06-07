import Link from 'next/link'
import styles from './ErrorCard.module.css'

interface ErrorCardProps {
  message: string
}

export default function ErrorCard({ message }: ErrorCardProps) {
  return (
    <div className={styles.card}>
      <h2 className={styles.title}>Unable to load results</h2>
      <p className={styles.message}>{message}</p>
      <Link href="/diagnostics/deep" className={styles.link}>
        Return to Diagnostic
      </Link>
    </div>
  )
}
