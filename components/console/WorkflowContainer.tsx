'use client'

import React from 'react'
import type { AgenticPhase } from '@/types/agenticWorkflow'
import PhaseBox from '@/components/console/PhaseBox'

interface WorkflowContainerProps {
  phases: AgenticPhase[]
  isComplete: boolean
}

export default function WorkflowContainer({ phases, isComplete }: WorkflowContainerProps) {
  return (
    <div className="bg-[#2C2C2C] rounded-xl p-6 border border-white/10">
      {phases.map((phase, index) => (
        <PhaseBox
          key={phase.id}
          phase={phase}
          defaultExpanded={index === phases.length - 1}
        />
      ))}
      {isComplete && phases.length > 0 && (
        <div className="mt-4 pt-4 border-t border-white/5 flex items-center gap-2">
          <svg
            width={16}
            height={16}
            viewBox="0 0 24 24"
            fill="none"
            stroke="#10B981"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span className="text-sm text-zinc-400">Workflow complete</span>
        </div>
      )}
    </div>
  )
}
