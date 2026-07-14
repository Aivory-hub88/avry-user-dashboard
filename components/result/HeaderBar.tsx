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
    <div className="relative w-full rounded-[18px] overflow-hidden bg-[#3a3a37] p-8 md:p-12 mb-8 border border-white/5 shadow-[0_4px_20px_rgba(0,0,0,0.3)] flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
      {/* Background Gradient Mesh */}
      <div className="absolute inset-0 opacity-30 pointer-events-none">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-[#b7cba6]/20 rounded-full blur-[100px]"></div>
        <div className="absolute top-1/2 right-12 w-80 h-80 bg-[#b7cba6]/10 rounded-full blur-[80px]"></div>
        <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-white/5 rounded-full blur-[80px]"></div>
      </div>

      <div className="relative z-10 max-w-2xl flex flex-col gap-2">
        <span className="text-[#a3a39c] text-xs uppercase tracking-wider font-semibold">AI READINESS REPORT</span>
        <h1 className={`text-3xl md:text-4xl font-semibold text-white tracking-tight ${styles.companyName}`}>
          {company}
        </h1>
        <span className="text-[#a1a1aa] text-base font-light">{formatDate(submittedAt)}</span>
      </div>

      <div className="relative z-10">
        <button 
          className={styles.btnFilled}
          onClick={onDownloadPdf}
          disabled={!onDownloadPdf || isExportingPdf}
        >
          {isExportingPdf ? 'Generating...' : 'Download Full Report'}
        </button>
      </div>
    </div>
  )
}
