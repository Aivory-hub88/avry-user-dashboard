"use client"

import { useState } from 'react'
import { Compass, X } from 'lucide-react'

interface ContinuedFromConsoleProps {
  summary: string
  onDismiss: () => void
}

export function ContinuedFromConsole({ summary, onDismiss }: ContinuedFromConsoleProps) {
  const [visible, setVisible] = useState(true)
  if (!visible) return null

  const truncated = summary.length > 60 ? summary.slice(0, 60) + '...' : summary

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 mb-4 bg-white/[0.04] border border-white/[0.08] rounded-lg animate-in slide-in-from-top-2 duration-200">
      <Compass className="w-3.5 h-3.5 text-white/40 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-white/70">Continued from Console</p>
        {truncated && <p className="text-[10px] text-white/40 truncate">{truncated}</p>}
      </div>
      <button
        onClick={() => { setVisible(false); onDismiss() }}
        className="p-1 rounded text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}
