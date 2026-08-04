import Link from 'next/link'
import styles from './ErrorCard.module.css'

interface ErrorCardProps {
  message: string
  locale?: 'en' | 'id'
}

export default function ErrorCard({ message, locale = 'en' }: ErrorCardProps) {
  return (
    <div className={styles.card}>
      <h2 className={styles.title}>{locale === 'id' ? 'Tidak dapat memuat hasil' : 'Unable to load results'}</h2>
      <p className={styles.message}>{message}</p>
      <Link href="/diagnostics/deep" className={styles.link}>
        {locale === 'id' ? 'Kembali ke Diagnostik' : 'Return to Diagnostic'}
      </Link>
    </div>
  )
}
