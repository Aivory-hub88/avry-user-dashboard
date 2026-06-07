"use client"

import { useState, useEffect } from 'react'
import { ArrowRight } from 'lucide-react'
import { ClassifiedIntent } from '@/lib/intentClassifier'

function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ')
}

interface RoutingSuggestBannerProps {
  intent: ClassifiedIntent
  onAccept: () => void
  onDismiss: () => void
}

const TAB_COLORS: Record<string, string> = {
  diagnostic: 'bg-[#D85A30] hover:bg-[#C24D27]',
  blueprint: 'bg-[#534AB7] hover:bg-[#4640A3]',
  workflow: 'bg-[#0F6E56] hover:bg-[#0A5A44]',
  integration: 'bg-[#0F6E56] hover:bg-[#0A5A44]',
  roadmap: 'bg-[#534AB7] hover:bg-[#4640A3]',
  settings: 'bg-white/10 hover:bg-white/20',
  dashboard: 'bg-[#854F0B] hover:bg-[#6E4009]',
  console: 'bg-white/10 hover:bg-white/20',
}

export function RoutingSuggestBanner({ intent, onAccept, onDismiss }: RoutingSuggestBannerProps) {
  const DISMISS_DURATION = 15 // 15 seconds
  const [secondsLeft, setSecondsLeft] = useState(DISMISS_DURATION)

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          onDismiss()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [onDismiss])

  const radius = 8
  const circumference = 2 * Math.PI * radius
  const progress = (secondsLeft / DISMISS_DURATION) * circumference

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 mx-4 mt-1 mb-2 bg-white/[0.04] border border-white/[0.08] rounded-lg animate-in slide-in-from-bottom-2 duration-200">
      <ArrowRight className="w-3.5 h-3.5 text-white/40 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-white/70 truncate">{intent.reason}</p>
        <p className="text-[10px] text-white/40 truncate">Open in {intent.tabLabel} for full tools</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onAccept}
          className={cn(
            'px-3 py-1 rounded-md text-xs font-medium text-white transition-colors',
            TAB_COLORS[intent.route] ?? 'bg-white/10 hover:bg-white/20'
          )}
        >
          Open {intent.tabLabel}
        </button>
        <button
          onClick={onDismiss}
          className="px-3 py-1 rounded-md text-xs text-white/50 border border-white/10 hover:bg-white/[0.06] hover:text-white/70 transition-colors"
        >
          Stay in Console
        </button>
      </div>
      <svg width="24" height="24" className="shrink-0 -rotate-90">
        <circle cx="12" cy="12" r={radius} fill="none" stroke="currentColor" strokeWidth="2" className="text-white/10" />
        <circle
          cx="12"
          cy="12"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          className="text-white/40 transition-all duration-1000 ease-linear"
          strokeLinecap="round"
        />
      </svg>
    </div>
  )
}