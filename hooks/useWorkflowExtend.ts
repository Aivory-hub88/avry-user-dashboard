/**
 * useWorkflowExtend Hook
 * 
 * Manages workflow extension state and API calls for adding follow-up steps
 * after a specific node using Aivory.
 */

import { useCallback, useState } from 'react'
import { AivoryWorkflowSpec, AivoryWorkflowEdge, WorkflowStep } from '@/types/workflows'

export interface WorkflowExtensionResult {
  newSteps: WorkflowStep[]
  newEdges: AivoryWorkflowEdge[]
  summary: string
}

export interface UseWorkflowExtendState {
  result: WorkflowExtensionResult | null
  loading: boolean
  error: string | null
}

export interface UseWorkflowExtendActions {
  extendWorkflow: (
    workflow: AivoryWorkflowSpec,
    sourceStepId: string,
    instruction: string
  ) => Promise<void>
  clearExtension: () => void
  setError: (error: string | null) => void
}

export function useWorkflowExtend(): UseWorkflowExtendState & UseWorkflowExtendActions {
  const [result, setResult] = useState<WorkflowExtensionResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const extendWorkflow = useCallback(
    async (workflow: AivoryWorkflowSpec, sourceStepId: string, instruction: string) => {
      if (!instruction.trim()) {
        setError('Please enter an instruction')
        return
      }

      setLoading(true)
      setError(null)
      setResult(null)

      try {
        const response = await fetch('/api/workflows/aira-extend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'EXTEND_AFTER_STEP',
            workflow,
            sourceStepId,
            instruction: instruction.trim(),
          }),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          const errorMsg = errorData.error || `HTTP ${response.status}`
          const details = errorData.details?.reason || ''
          setError(details ? `${errorMsg}: ${details}` : errorMsg)
          return
        }

        const extensionResult: WorkflowExtensionResult = await response.json()
        setResult(extensionResult)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to extend workflow'
        setError(message)
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const clearExtension = useCallback(() => {
    setResult(null)
    setError(null)
  }, [])

  return {
    result,
    loading,
    error,
    extendWorkflow,
    clearExtension,
    setError,
  }
}
