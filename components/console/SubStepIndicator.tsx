'use client'

import React from 'react'
import type { SubStepIcon } from '@/types/agenticWorkflow'

interface SubStepIndicatorProps {
  icon: SubStepIcon
  label: string
  duration?: number
}

/**
 * Returns an outline SVG icon (16x16, stroke-based) for the given sub-step icon type.
 * Uses currentColor so the icon inherits the parent text color.
 */
export function getSubStepSvgIcon(icon: SubStepIcon): React.ReactNode {
  const shared = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }

  switch (icon) {
    case 'thinking':
      // Lightning bolt
      return (
        <svg {...shared}>
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
      )
    case 'editing':
      // Pencil
      return (
        <svg {...shared}>
          <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
        </svg>
      )
    case 'searching':
      // Magnifying glass
      return (
        <svg {...shared}>
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
      )
    case 'generating':
      // Sparkle
      return (
        <svg {...shared}>
          <path d="M12 2l2.09 6.26L20 10l-5.91 1.74L12 18l-2.09-6.26L4 10l5.91-1.74L12 2z" />
        </svg>
      )
    case 'terminal':
      // Terminal / command prompt
      return (
        <svg {...shared}>
          <polyline points="4 17 10 11 4 5" />
          <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
      )
    case 'file':
      // Document
      return (
        <svg {...shared}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      )
  }
}

/**
 * Formats a duration (in milliseconds) as a human-readable string.
 * Returns "(Xs)" for whole seconds or "(X.Xs)" for fractional seconds.
 */
function formatDuration(ms: number): string {
  const seconds = ms / 1000
  const formatted = Number.isInteger(seconds) ? `${seconds}s` : `${seconds.toFixed(1)}s`
  return `(${formatted})`
}

export default function SubStepIndicator({ icon, label, duration }: SubStepIndicatorProps) {
  return (
    <div className="inline-flex items-center gap-2 bg-[#5A5A5A] rounded-md px-3 py-2 text-sm font-medium text-zinc-200">
      <span className="flex-shrink-0 text-zinc-300">{getSubStepSvgIcon(icon)}</span>
      <span>{label}</span>
      {duration != null && (
        <span className="text-zinc-400">{formatDuration(duration)}</span>
      )}
    </div>
  )
}
