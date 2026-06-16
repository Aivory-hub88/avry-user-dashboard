import re

content = """
"use client"

import { useState, useEffect } from 'react'
import { MoveRight } from 'lucide-react'
import { ClassifiedIntent } from '@/lib/intentClassifier'
import { buildUserContextState } from '@/lib/userContextState'

function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ')
}

interface RoutingSuggestBannerProps {
  intent: ClassifiedIntent
  onAccept: () => void
  onDismiss: () => void
}

const TAB_COLORS: Record<string, string> = {
  diagnostic: 'bg-[#F2A988] text-[#7A2E12] hover:bg-[#E89370]',
  blueprint: 'bg-[#A39DEB] text-[#292275] hover:bg-[#8D86D6]',
  workflow: 'bg-[#8CE1C9] text-[#125C47] hover:bg-[#72D0B4]',
  agent: 'bg-[#EBC1A3] text-[#754422] hover:bg-[#DBA886]',
  deploy: 'bg-[#EBC1A3] text-[#754422] hover:bg-[#DBA886]',
  roadmap: 'bg-[#A39DEB] text-[#292275] hover:bg-[#8D86D6]',
  pricing: 'bg-[#F3C2C2] text-[#822828] hover:bg-[#E6A8A8]',
  default: 'bg-[#E8E8E8] text-[#444444] hover:bg-[#D4D4D4]',
}

const ACTION_TEXTS: Record<string, string> = {
  diagnostic: 'Run your diagnostic',
  blueprint: 'Generate Your Blueprint',
  agent: 'Deploy an Agent',
  deploy: 'Deploy an Agent',
  workflow: 'Open Workflow Builder',
  pricing: 'See One time Service Pricing',
}

export function RoutingSuggestBanner({ intent: originalIntent, onAccept, onDismiss }: RoutingSuggestBannerProps) {
  const DISMISS_DURATION = 15 // 15 seconds
  const [secondsLeft, setSecondsLeft] = useState(DISMISS_DURATION)
  const [effectiveIntent, setEffectiveIntent] = useState<ClassifiedIntent>(originalIntent)

  // Subscription Override Logic
  useEffect(() => {
    const state = buildUserContextState()
    
    const premiumRoutes = ['diagnostic', 'blueprint', 'roadmap', 'workflow', 'agent', 'deploy']
    
    if (state.is_subscription_member && !state.has_purchased_onetime_service) {
      if (premiumRoutes.includes(originalIntent.route)) {
        setEffectiveIntent({
          route: 'pricing',
          confidence: 1,
          reason: 'Subscription member requires one-time service purchase',
          tabLabel: 'Pricing'
        })
      } else {
        setEffectiveIntent(originalIntent)
      }
    } else {
      setEffectiveIntent(originalIntent)
    }
  }, [originalIntent])

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

  const route = effectiveIntent.route.toLowerCase()
  const buttonColor = TAB_COLORS[route] ?? TAB_COLORS.default
  const buttonText = ACTION_TEXTS[route] ?? `Open ${effectiveIntent.tabLabel}`

  return (
    <div className="flex justify-center mx-4 mt-2 mb-4 animate-in slide-in-from-bottom-2 duration-300" style={{ fontFamily: 'var(--font-manrope), sans-serif' }}>
      <div className="flex items-center gap-6 px-6 py-3 bg-[#4A4A4A] rounded-full shadow-lg border border-white/10">
        
        <div className="flex items-center gap-4">
          <span className="text-white/90 text-sm md:text-base font-medium tracking-wide">
            Click the button to
          </span>
          <MoveRight className="w-5 h-5 text-white/90 stroke-[1.5]" />
        </div>
        
        <button
          onClick={onAccept}
          className={cn(
            'px-6 py-2 rounded-full text-sm md:text-base font-bold transition-all duration-200',
            buttonColor
          )}
        >
          {buttonText}
        </button>

      </div>
    </div>
  )
}
"""

with open('/Users/ireichmann/Documents/Aivory V2/frontend/avry-user-dashboard/components/chat/RoutingSuggestBanner.tsx', 'w') as f:
    f.write(content.strip() + "\\n")
