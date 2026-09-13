'use client'
/**
 * Tracks whether an observed element's own box has dropped below a width
 * and/or height threshold — used by OfficeShell to refuse to render the
 * three-column office below ~1100px rather than let the grid tracks squeeze
 * the chat column into an unreadable sliver (see docs/CERVEAU-WORKING-OFFICE-
 * PLANNING.md's Risks: "Below ~1100px the office should refuse to render
 * rather than degrade" — stated since Phase 8, never actually built until
 * now).
 *
 * Originally width-only. A short-but-wide window (a small floating browser
 * window, a laptop lid barely open, a window dragged short on an external
 * monitor) passed the width check untouched while the chat column — the
 * only one of the three that isn't a fixed-height header + scroll region —
 * had almost no usable vertical room left above the composer. Collapsing
 * the side panels doesn't add height back (this is a horizontal grid split),
 * but it does strip the two least-essential things competing for that
 * cramped space, the same "protect the one column that matters" call the
 * width guard already makes.
 *
 * Measures the element's own box, not window.innerWidth/innerHeight — the
 * global nav sidebar's own width already eats into what's available, so this
 * stays correct regardless of whether that sidebar is collapsed or expanded.
 */
import { useEffect, useRef, useState } from 'react'

export function useMinWidth<T extends HTMLElement>(minWidth: number, minHeight = 0) {
  const ref = useRef<T>(null)
  const [tooNarrow, setTooNarrow] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const check = (width: number, height: number) =>
      setTooNarrow(width < minWidth || height < minHeight)
    const rect = el.getBoundingClientRect()
    check(rect.width, rect.height)
    const observer = new ResizeObserver(([entry]) => check(entry.contentRect.width, entry.contentRect.height))
    observer.observe(el)
    return () => observer.disconnect()
  }, [minWidth, minHeight])

  return { ref, tooNarrow }
}
