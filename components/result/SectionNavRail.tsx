'use client'

import { useEffect, useRef, useState } from 'react'
import styles from './SectionNavRail.module.css'

export interface SectionNavItem {
  id: string
  label: string
}

interface SectionNavRailProps {
  sections: SectionNavItem[]
}

/**
 * Phase E2.5 — sticky in-page anchor rail for the ~10-section deep
 * diagnostic report. Desktop-only (hidden below the page's existing mobile
 * breakpoint via CSS); positioning is CSS `position: sticky`, navigation is
 * `scrollIntoView` (no hash-based anchor jumps), and the active section is
 * tracked with an IntersectionObserver scroll-spy instead of a scroll
 * listener, so this never causes layout thrash.
 */
export default function SectionNavRail({ sections }: SectionNavRailProps) {
  const [activeId, setActiveId] = useState<string | null>(sections[0]?.id ?? null)
  // Sections list is effectively static per render of a loaded report, but
  // keep a ref so the observer effect below doesn't need it in its deps.
  const sectionsRef = useRef(sections)
  sectionsRef.current = sections

  useEffect(() => {
    const targets = sectionsRef.current
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null)

    if (targets.length === 0) return

    // Trigger zone is a thin band near the top of the viewport so exactly
    // one section is "active" at a time as the user scrolls through tall
    // cards, without any manual scroll-position math.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id)
          }
        }
      },
      { rootMargin: '-15% 0px -70% 0px', threshold: 0 }
    )

    targets.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [sections])

  const handleClick = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (sections.length === 0) return null

  return (
    <nav className={styles.rail} aria-label="Report sections">
      <ul className={styles.list}>
        {sections.map((s) => (
          <li key={s.id} className={styles.item}>
            <button
              type="button"
              className={`${styles.link} ${activeId === s.id ? styles.linkActive : ''}`}
              onClick={() => handleClick(s.id)}
              aria-current={activeId === s.id ? 'true' : undefined}
            >
              <span className={styles.dot} aria-hidden="true" />
              <span className={styles.label}>{s.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
