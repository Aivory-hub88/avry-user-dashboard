"use client"

import styles from "./LanguageOptionCard.module.css"

interface LanguageOptionCardProps {
  locale: "en" | "id"
  label: string
  description: string
  isActive: boolean
  onClick: () => void
}

export default function LanguageOptionCard({ label, description, isActive, onClick }: LanguageOptionCardProps) {
  return (
    <button
      className={`${styles.card} ${isActive ? styles.active : ""}`}
      onClick={onClick}
      aria-pressed={isActive}
    >
      <span className={styles.label}>{label}</span>
      <span className={styles.description}>{description}</span>
      {isActive && <span className={styles.check}>✓</span>}
    </button>
  )
}
