import { formatDate } from '@/lib/resultFormatters'
import styles from './HeaderBar.module.css'

interface HeaderBarProps {
  company: string
  submittedAt: string
  onDownloadPdf?: () => void
  isExportingPdf?: boolean
}

export default function HeaderBar({ company, submittedAt, onDownloadPdf, isExportingPdf }: HeaderBarProps) {
  return (
    <header className={styles.bar}>
      <div className={styles.meta}>
        <span className={styles.label}>AI READINESS REPORT</span>
        <h1 className={styles.company}>{company}</h1>
        <span className={styles.date}>{formatDate(submittedAt)}</span>
      </div>
      <div className={styles.actions}>
        <button 
          className={styles.btnFilled}
          onClick={onDownloadPdf}
          disabled={!onDownloadPdf || isExportingPdf}
        >
          {isExportingPdf ? 'Generating...' : 'Download Full Report'}
        </button>
      </div>
    </header>
  )
}
