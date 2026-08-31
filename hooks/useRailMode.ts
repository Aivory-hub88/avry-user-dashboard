'use client'
/**
 * Decides whether the agent rail pushes the chat column or floats over it.
 *
 * 708px is the chat column's own reading-measure floor (660px max-w-[660px]
 * content + padding). At the 330px rail width, that only clears with room
 * to spare once the shell itself is at least 1500px — below that, pushing
 * would squeeze the chat under 708px, so the rail floats instead and the
 * reading column never loses its width.
 */
import { useEffect, useRef, useState } from 'react'

const DOCK_AT = 1500

export type RailMode = 'dock' | 'float'

export function useRailMode() {
  const ref = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<RailMode>('dock')

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      setMode(entry.contentRect.width >= DOCK_AT ? 'dock' : 'float')
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return { ref, mode }
}
