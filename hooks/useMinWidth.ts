'use client'
/**
 * Tracks whether an observed element's own width has dropped below a
 * threshold — used by OfficeShell to refuse to render the three-column
 * office below ~1100px rather than let the grid tracks squeeze the chat
 * column into an unreadable sliver (see docs/CERVEAU-WORKING-OFFICE-
 * PLANNING.md's Risks: "Below ~1100px the office should refuse to render
 * rather than degrade" — stated since Phase 8, never actually built until
 * now).
 *
 * Measures the element's own box, not window.innerWidth — the global nav
 * sidebar's own width already eats into what's available, so this stays
 * correct regardless of whether that sidebar is collapsed or expanded.
 */
import { useEffect, useRef, useState } from 'react'

export function useMinWidth<T extends HTMLElement>(minWidth: number) {
  const ref = useRef<T>(null)
  const [tooNarrow, setTooNarrow] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const check = (width: number) => setTooNarrow(width < minWidth)
    check(el.getBoundingClientRect().width)
    const observer = new ResizeObserver(([entry]) => check(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [minWidth])

  return { ref, tooNarrow }
}
