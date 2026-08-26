import { useTranslations } from 'next-intl'
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
  const t = useTranslations("blueprint")
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
            {t("sampleBannerText")}
          </span>
        </div>
      )}

      <div className={styles.headerContent}>
        {/* LEFT: company + blueprint meta */}
        <div className={styles.blueprintHeaderLeft}>
          <span className={styles.companyLabel}>{t("companyLabel")}</span>
          <div className={styles.companyName}>{companyName}</div>

          <div className={styles.titleRow}>
            <h1 className={styles.blueprintTitle}>{t("title")}</h1>
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
                    {t("versionLabel", { version: v.version })}
                  </option>
                ))}
              </select>
            ) : (
              <span className={styles.versionText}>{t("versionLabel", { version })}</span>
            )}
            <span className={styles.versionDot} aria-hidden="true" />
            <span className={styles.draftPill}>{status}</span>
          </div>

          <div className={styles.pillsRow}>
            <div className={styles.pill}>
              <span className={styles.pillLabel}>{t("maturityLevelPillLabel")}</span>
              <span className={styles.pillValue}>{maturityLevel}</span>
            </div>
            <div className={styles.pill}>
              <span className={styles.pillLabel}>{t("estimatedRoiLabel")}</span>
              <span className={styles.pillValue}>{t("monthsCount", { count: estimatedROI })}</span>
            </div>
          </div>
        </div>

        {/* RIGHT: actions — one primary (Generate Roadmap), the rest quiet */}
        <div className={styles.rightColumn}>
          <div className={styles.actionRow}>
            {onGenerateRoadmap && (
              <button
                onClick={onGenerateRoadmap}
                className={styles.generateRoadmapBtn}
                disabled={generatingRoadmap}
                aria-busy={generatingRoadmap}
                title={t("generateRoadmapTooltip")}
              >
                <span>{generatingRoadmap ? t("generatingRoadmap") : t("generateRoadmap")}</span>
                <svg className={styles.generateRoadmapArrow} width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3 8h10M9 3.5 13.5 8 9 12.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
            {onSaveVersion && (
              <button onClick={onSaveVersion} className={styles.headerActionBtn} title={t("saveThisVersionTooltip")}>
                {t("saveVersion")}
              </button>
            )}
            {onDownloadPDF || onDownloadDOCX ? (
              <button onClick={onDownloadPDF} className={styles.headerActionBtn} disabled={downloadLoading} title={t("downloadBlueprintTooltip")}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M8 2v8m0 0 3-3m-3 3L5 7" />
                  <path d="M2.5 11.5v1a1.5 1.5 0 0 0 1.5 1.5h8a1.5 1.5 0 0 0 1.5-1.5v-1" />
                </svg>
                {t("download")}
              </button>
            ) : null}
            {onShowHistory && (
              <button onClick={onShowHistory} className={styles.headerActionBtn} title={t("viewVersionHistoryTooltip")}>
                {t("history")} ({versionsCount})
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
