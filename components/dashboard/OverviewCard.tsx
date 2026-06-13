import Link from "next/link"
import { DashboardData } from "@/types/dashboard"
import styles from "./OverviewCard.module.css"

interface OverviewCardProps {
  data: DashboardData
  deepDiagnosticCompleted?: boolean
}

// PROGRESS RING — horizontal layout: ring left, label+number right
function ScoreRing({ score }: { score: number }) {
  const r = 36
  const circ = 2 * Math.PI * r
  const pct = Math.min(Math.max(score, 0), 100) / 100
  const offset = circ * (1 - pct)
  // Legacy parity: high score uses brand mint (#0ae8af) accent
  const color = score >= 70 ? '#0ae8af' : score >= 40 ? '#fbbf24' : '#f87171'

  return (
    <div className={styles.ringWrap}>
      <svg width="88" height="88" viewBox="0 0 88 88" className={styles.ring}>
        <circle className={styles.ringBg} cx="44" cy="44" r={r} />
        <circle
          className={styles.ringFill}
          cx="44" cy="44" r={r}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          stroke={color}
        />
      </svg>
      <div className={styles.ringTextBlock}>
        <span className={styles.ringCaption}>AI Score</span>
        <div className={styles.ringNumberRow}>
          <span className={`${styles.ringLabel} text-brand-mint`}>{score}</span>
          <span className={styles.ringSubLabel}>/100</span>
        </div>
      </div>
    </div>
  )
}

// ADDED: STATUS BADGE — color-coded pill
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    completed:   { label: 'Completed',   cls: styles.badgeGreen },
    in_progress: { label: 'In Progress', cls: styles.badgeYellow },
    not_started: { label: 'Not Started', cls: styles.badgeGray },
    none:        { label: 'None',        cls: styles.badgeGray },
    draft:       { label: 'Draft',       cls: styles.badgeGray },
    active:      { label: 'Active',      cls: styles.badgeGreen },
  }
  const entry = map[status] ?? { label: status, cls: styles.badgeGray }
  return <span className={`${styles.badge} ${entry.cls}`}>{entry.label}</span>
}

export default function OverviewCard({ data, deepDiagnosticCompleted }: OverviewCardProps) {
  const score = data.diagnostic.score ?? 0

  const maturity = score >= 70 ? 'Advanced' : score >= 40 ? 'Emerging' : 'Foundational'

  return (
    <div className={styles.overviewCard}>
      {/* FIXED: CARD HEADER — title + score ring */}
      <div className={styles.cardHeader}>
        <div className={styles.titleBlock}>
          <h2 className={styles.title}>AI Operating System Overview</h2>
          <p className={styles.subtitle}>Maturity: {maturity}</p>
        </div>
        {score > 0 && <ScoreRing score={score} />}
      </div>

      {/* FIXED: STATUS GRID — 3 metric tiles */}
      <div className={styles.statusGrid}>
        <div className={styles.statusItem}>
          <span className={styles.label}>Last Diagnostic</span>
          <StatusBadge status={deepDiagnosticCompleted ? 'completed' : data.diagnostic.status} />
          {(deepDiagnosticCompleted || data.diagnostic.score) && (
            <span className={styles.detail}>
              Score: <span className="text-brand-mint font-semibold">{score}</span>/100
              {data.diagnostic.date ? ` • ${data.diagnostic.date}` : ''}
            </span>
          )}
        </div>

        <div className={styles.statusItem}>
          <span className={styles.label}>Blueprint</span>
          {data.blueprint.name ? (
            <>
              <span className={styles.value}>{data.blueprint.name}</span>
              <span className={styles.detail}>v{data.blueprint.version}</span>
            </>
          ) : (
            <span className={styles.placeholder}>No blueprint yet</span>
          )}
        </div>

        <div className={styles.statusItem}>
          <span className={styles.label}>Workflows</span>
          <span className={styles.value}>{data.workflows.active} active</span>
          {data.workflows.total > 0 && (
            <span className={styles.detail}>{data.workflows.total} total</span>
          )}
        </div>
      </div>

      {/* ADDED: 2x2 CTA GRID — icon + label buttons */}
      <div className={styles.ctaGrid}>
        <Link href="/console" className={`${styles.ctaBtn} ${styles.ctaBtnPrimary} bg-brand-purple text-white hover:bg-brand-mint hover:text-bg-primary`}>
          {/* ADDED: SVG ICON — chat bubble */}
          <svg className={styles.ctaIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          Open Console
        </Link>
        <Link href="/diagnostics" className={styles.ctaBtn}>
          {/* ADDED: SVG ICON — chart bar */}
          <svg className={styles.ctaIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
          </svg>
          Open Diagnostics
        </Link>
        <Link href="/blueprint" className={styles.ctaBtn}>
          {/* ADDED: SVG ICON — layers */}
          <svg className={styles.ctaIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>
          </svg>
          View Blueprint
        </Link>
        <Link href="/workflows" className={styles.ctaBtn}>
          {/* ADDED: SVG ICON — git branch */}
          <svg className={styles.ctaIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>
          </svg>
          View Workflows
        </Link>
      </div>
    </div>
  )
}
