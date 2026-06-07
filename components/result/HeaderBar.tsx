import { formatDate } from '@/lib/resultFormatters'
import styles from './HeaderBar.module.css'

interface HeaderBarProps {
  company: string
  submittedAt: string
}

export default function HeaderBar({ company, submittedAt }: HeaderBarProps) {
  return (
    <header className={styles.bar}>
      <div className={styles.meta}>
        <span className={styles.label}>AI READINESS REPORT</span>
        <h1 className={styles.company}>{company}</h1>
        <span className={styles.date}>{formatDate(submittedAt)}</span>
      </div>
      <div className={styles.actions}>
        {/* TODO: implement card export — disabled until export service is available */}
        <button disabled className={styles.btnOutlined}>Download Diagnostic Card</button>
        {/* TODO: implement PDF export — disabled until export service is available */}
        <button disabled className={styles.btnFilled}>Download Full Report</button>
      </div>
    </header>
  )
}
