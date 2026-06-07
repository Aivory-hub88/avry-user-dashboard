"use client"

import Link from "next/link"
import styles from "./LifecycleCard.module.css"

interface LifecycleCardProps {
  title: string
  description: string
  status: string
  cta: string
  href: string
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    completed:   { label: "Completed",   cls: "completed" },
    in_progress: { label: "In Progress", cls: "in_progress" },
    not_started: { label: "Not Started", cls: "not_started" },
    none:        { label: "Not Started", cls: "none" },
    draft:       { label: "Draft",       cls: "draft" },
    active:      { label: "Active",      cls: "active" },
  }
  const entry = map[status] ?? { label: status, cls: "not_started" }
  const cls = [styles.statusBadge, styles[entry.cls]].filter(Boolean).join(" ")
  return (
    <span className={cls}>
      {entry.label}
    </span>
  )
}

function DiagnosticsIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  )
}

function BlueprintIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2"/>
      <polyline points="2 17 12 22 22 17"/>
      <polyline points="2 12 12 17 22 12"/>
    </svg>
  )
}

function WorkflowsIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="6" y1="3" x2="6" y2="15"/>
      <circle cx="18" cy="6" r="3"/>
      <circle cx="6" cy="18" r="3"/>
      <path d="M18 9a9 9 0 0 1-9 9"/>
    </svg>
  )
}

function DefaultIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
    </svg>
  )
}

function CardIcon({ title }: { title: string }) {
  if (title === "Diagnostics") return <DiagnosticsIcon />
  if (title === "Blueprint") return <BlueprintIcon />
  if (title === "Workflows") return <WorkflowsIcon />
  return <DefaultIcon />
}

export default function LifecycleCard({ title, description, status, cta, href }: LifecycleCardProps) {
  return (
    <div className={styles.lifecycleCard}>
      <div className={styles.cardTop}>
        <div className={styles.cardIcon}>
          <CardIcon title={title} />
        </div>
        <h3 className={styles.title}>{title}</h3>
      </div>

      <p className={styles.description}>{description}</p>

      <div className={styles.statusRow}>
        <span className={styles.statusLabel}>Status</span>
        <StatusBadge status={status} />
      </div>

      <Link href={href} className={styles.cta}>
        {cta}
      </Link>
    </div>
  )
}
