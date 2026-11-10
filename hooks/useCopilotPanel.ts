'use client'

import { useState, useEffect, useCallback } from 'react'

/** closed = pill in the top bar · open = full panel · minimized = draggable chip */
export type CopilotPanelMode = 'closed' | 'open' | 'minimized'

export function useCopilotPanel() {
  const [mode, setMode] = useState<CopilotPanelMode>('closed')

  const open = useCallback(() => setMode('open'), [])
  const close = useCallback(() => setMode('closed'), [])
  const minimize = useCallback(() => setMode('minimized'), [])
  const restore = useCallback(() => setMode('open'), [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // ⌘K: pill → panel, panel → pill, chip → panel
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setMode(prev => (prev === 'open' ? 'closed' : 'open'))
      }
      if (e.key === 'Escape') {
        setMode(prev => (prev === 'open' ? 'closed' : prev))
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  return { mode, isOpen: mode !== 'closed', open, close, minimize, restore }
}
