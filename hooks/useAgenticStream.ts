'use client'

import { useState, useCallback } from 'react'
import { agenticReducer } from '@/lib/agenticReducer'
import type { AgenticWorkflowState, StreamEvent } from '@/types/agenticWorkflow'

/**
 * React hook wrapping the pure agenticReducer.
 *
 * Exposes agentic workflow state, an isAgentic flag,
 * a processEvent dispatcher, and a reset function.
 *
 * Requirements: 1.1–1.7, 3.1, 3.2
 */
export function useAgenticStream() {
  const [agenticState, setAgenticState] = useState<AgenticWorkflowState | null>(null)

  const processEvent = useCallback((event: StreamEvent) => {
    setAgenticState((prev) => agenticReducer(prev, event))
  }, [])

  const reset = useCallback(() => {
    setAgenticState(null)
  }, [])

  const isAgentic = agenticState !== null

  return { agenticState, isAgentic, processEvent, reset } as const
}
