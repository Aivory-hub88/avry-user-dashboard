import { formatDate } from '@/lib/resultFormatters'
import type { DiagnosticDelta } from '@/lib/diagnosticHistory'
import DeltaChip from './DeltaChip'
import GrainHeader from '@/components/ui/GrainHeader'
import styles from './HeaderBar.module.css'

interface HeaderBarProps {
  company: string
  submittedAt: string
  onDownloadPdf?: () => void
  isExportingPdf?: boolean
  /** Phase E2.3 — null/undefined renders no chip (signed out, <2 history rows, or flat score). */
  delta?: DiagnosticDelta | null
  locale?: 'en' | 'id'
}

export default function HeaderBar({ company, submittedAt, onDownloadPdf, isExportingPdf, delta, locale = 'en' }: HeaderBarProps) {
  return (
    <GrainHeader world="teal" className="w-full rounded-[18px] p-8 md:p-12 mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
      <div className="relative z-10 max-w-2xl flex flex-col gap-2">
        <span className="text-white/70 text-xs uppercase tracking-wider font-semibold">
          {locale === 'id' ? 'ASESMEN OPERASIONAL BISNIS' : 'BUSINESS OPERATIONS ASSESSMENT'}
        </span>
        <h1 className={`text-3xl md:text-4xl font-semibold text-white tracking-tight ${styles.companyName}`}>
          {company}
        </h1>
        <span className="text-white/75 text-base font-light">{formatDate(submittedAt, locale)}</span>
        <DeltaChip delta={delta ?? null} locale={locale} />
      </div>

      <div className="relative z-10">
        <button
          className={styles.btnFilled}
          onClick={onDownloadPdf}
          disabled={!onDownloadPdf || isExportingPdf}
        >
          {isExportingPdf ? (locale === 'id' ? 'Membuat...' : 'Generating...') : (locale === 'id' ? 'Unduh Laporan Lengkap' : 'Download Full Report')}
        </button>
      </div>
    </GrainHeader>
  )
}
