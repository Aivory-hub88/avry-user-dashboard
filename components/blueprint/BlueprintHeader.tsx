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
            <span className={styles.separator}>•</span>
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

        {/* RIGHT: actions */}
        <div className={styles.rightColumn}>
          <div className={styles.actionRow}>
            <span className={styles.draftBadge}>{status}</span>
            {onSaveVersion && (
              <button onClick={onSaveVersion} className={`${styles.saveVersionBtn} btn-style-a`} title={t("saveThisVersionTooltip")}>
                {t("saveVersion")}
              </button>
            )}
            {onDownloadPDF || onDownloadDOCX ? (
              <button onClick={onDownloadPDF} className={`${styles.downloadBtn} btn-style-b`} title={t("downloadBlueprintTooltip")}>
                {t("download")} ↓
              </button>
            ) : null}
            {onShowHistory && (
              <button onClick={onShowHistory} className={`${styles.historyBtn} btn-style-a`} title={t("viewVersionHistoryTooltip")}>
                {t("history")} ({versionsCount})
              </button>
            )}
          </div>

          {onGenerateRoadmap && (
            <button
              onClick={onGenerateRoadmap}
              className={`${styles.generateRoadmapBtn} btn-style-b`}
              disabled={generatingRoadmap}
              title={t("generateRoadmapTooltip")}
            >
              {generatingRoadmap ? t("generatingRoadmap") : t("generateRoadmap")}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
