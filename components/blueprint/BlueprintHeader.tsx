import styles from './BlueprintHeader.module.css'

interface BlueprintVersion {
  version: string
  created_at: string
  created_by: string
  status: string
}

interface BlueprintHeaderProps {
  blueprintId: string
  companyName: string
  version: string
  status: string
  maturityLevel: string
  estimatedROI: number
  showSampleBanner?: boolean
  versions?: BlueprintVersion[]
  onVersionChange?: (version: string) => void
  onRegenerate?: () => void
  onSaveVersion?: () => void
  onDownloadPDF?: () => void
  onDownloadDOCX?: () => void
  onShowHistory?: () => void
  versionsCount?: number
  downloadLoading?: boolean
  generatingRoadmap?: boolean
  onGenerateRoadmap?: () => void
}

export default function BlueprintHeader(props: BlueprintHeaderProps) {
  const {
    blueprintId,
    companyName,
    version,
    status,
    maturityLevel,
    estimatedROI,
    showSampleBanner = false,
    versions = [],
    onVersionChange,
    onRegenerate,
    onSaveVersion,
    onDownloadPDF,
    onDownloadDOCX,
    onShowHistory,
    versionsCount = 0,
    downloadLoading = false,
    generatingRoadmap = false,
    onGenerateRoadmap,
  } = props

  return (
    <div className={styles.headerContainer}>
      {showSampleBanner && (
        <div className={styles.sampleBanner}>
          <span className={styles.bannerIcon}>i</span>
          <span className={styles.bannerText}>
            This is a sample AI System Blueprint. In the next phase, this will be generated from your diagnostic.
          </span>
        </div>
      )}

      <div className={styles.headerContent}>
        {/* LEFT: company + blueprint meta */}
        <div className={styles.blueprintHeaderLeft}>
          <span className={styles.companyLabel}>COMPANY</span>
          <div className={styles.companyName}>{companyName}</div>

          <div className={styles.titleRow}>
            <h1 className={styles.blueprintTitle}>AI System Blueprint</h1>
            <span className={styles.blueprintId}>{blueprintId}</span>
          </div>

          <div className={styles.versionRow}>
            {versions.length > 0 && onVersionChange ? (
              <select
                value={version}
                onChange={(e) => onVersionChange(e.target.value)}
                className={styles.versionDropdown}
              >
                {versions.map((v) => (
                  <option key={v.version} value={v.version}>
                    Version {v.version}
                  </option>
                ))}
              </select>
            ) : (
              <span className={styles.versionText}>Version {version}</span>
            )}
            <span className={styles.separator}>•</span>
            <span className={styles.draftPill}>{status}</span>
          </div>

          <div className={styles.pillsRow}>
            <div className={styles.pill}>
              <span className={styles.pillLabel}>Maturity level</span>
              <span className={styles.pillValue}>{maturityLevel}</span>
            </div>
            <div className={styles.pill}>
              <span className={styles.pillLabel}>Estimated ROI</span>
              <span className={styles.pillValue}>{estimatedROI} months</span>
            </div>
          </div>
        </div>

        {/* RIGHT: actions */}
        <div className={styles.rightColumn}>
          <div className={styles.actionRow}>
            <span className={styles.draftBadge}>{status}</span>
            {onSaveVersion && (
              <button onClick={onSaveVersion} className={`${styles.saveVersionBtn} btn-style-a`} title="Save this version">
                Save Version
              </button>
            )}
            {onDownloadPDF || onDownloadDOCX ? (
              <button onClick={onDownloadPDF} className={`${styles.downloadBtn} btn-style-b`} title="Download blueprint">
                Download ↓
              </button>
            ) : null}
            {onShowHistory && (
              <button onClick={onShowHistory} className={`${styles.historyBtn} btn-style-a`} title="View version history">
                History ({versionsCount})
              </button>
            )}
          </div>

          {onGenerateRoadmap && (
            <button 
              onClick={onGenerateRoadmap} 
              className={`${styles.generateRoadmapBtn} btn-style-b`}
              disabled={generatingRoadmap}
              title="Generate roadmap from this blueprint"
            >
              {generatingRoadmap ? 'Generating...' : 'Generate Roadmap'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
