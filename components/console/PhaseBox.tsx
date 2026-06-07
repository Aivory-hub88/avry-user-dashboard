'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import type { AgenticPhase } from '@/types/agenticWorkflow'
import SubStepIndicator from '@/components/console/SubStepIndicator'
import FileAttachmentBar from '@/components/console/FileAttachmentBar'

interface PhaseBoxProps {
  phase: AgenticPhase
  defaultExpanded?: boolean
}

function PhaseStatusIcon({ status }: { status: AgenticPhase['status'] }) {
  if (status === 'in_progress') {
    return (
      <svg
        width={16}
        height={16}
        viewBox="0 0 24 24"
        fill="none"
        className="animate-spin text-zinc-400"
      >
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="31.4 31.4"
          strokeLinecap="round"
        />
      </svg>
    )
  }

  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#10B981"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="transition-opacity duration-300 opacity-100"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

export default function PhaseBox({ phase, defaultExpanded = false }: PhaseBoxProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const contentRef = useRef<HTMLDivElement>(null)
  const isFirstRender = useRef(true)

  const hasContent = phase.subSteps.length > 0 || phase.fileOps.length > 0

  const handleToggle = useCallback(() => {
    setExpanded((prev) => !prev)
  }, [])

  useEffect(() => {
    const content = contentRef.current
    if (!content) return

    // Skip animation on first render
    if (isFirstRender.current) {
      isFirstRender.current = false
      if (expanded) {
        content.style.height = 'auto'
        content.style.overflow = 'visible'
      } else {
        content.style.height = '0px'
        content.style.overflow = 'hidden'
      }
      return
    }

    if (expanded) {
      // Expanding: measure scrollHeight, animate from 0
      const naturalHeight = content.scrollHeight
      content.style.height = '0px'
      content.style.overflow = 'hidden'

      // Force reflow
      void content.offsetHeight

      content.style.transition = 'height 300ms ease-in-out'
      content.style.height = naturalHeight + 'px'

      const onEnd = () => {
        content.style.height = 'auto'
        content.style.overflow = 'visible'
        content.style.transition = ''
        content.removeEventListener('transitionend', onEnd)
      }
      content.addEventListener('transitionend', onEnd)
    } else {
      // Collapsing: capture current height, animate to 0
      const currentHeight = content.scrollHeight
      content.style.height = currentHeight + 'px'
      content.style.overflow = 'hidden'

      // Force reflow
      void content.offsetHeight

      content.style.transition = 'height 300ms ease-in-out'
      content.style.height = '0px'

      const onEnd = () => {
        content.style.transition = ''
        content.removeEventListener('transitionend', onEnd)
      }
      content.addEventListener('transitionend', onEnd)
    }
  }, [expanded])

  return (
    <div>
      <button
        onClick={handleToggle}
        className="flex items-center gap-3 w-full bg-[#3A3A3A] rounded-lg py-4 px-6 text-left"
      >
        {/* Animated Chevron */}
        <svg
          width={12}
          height={12}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`flex-shrink-0 text-zinc-500 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>

        <span className="text-zinc-100 text-sm font-medium flex-1">{phase.title}</span>

        <span className="flex-shrink-0">
          <PhaseStatusIcon status={phase.status} />
        </span>
      </button>

      <div ref={contentRef}>
        {hasContent && (
          <div className="px-6 pb-4 pt-3 space-y-2">
            {phase.subSteps.map((step) => (
              <SubStepIndicator
                key={step.id}
                icon={step.icon}
                label={step.label}
                duration={step.duration}
              />
            ))}
            {phase.fileOps.map((op) => (
              <FileAttachmentBar
                key={op.id}
                filename={op.filename}
                action={op.action}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
