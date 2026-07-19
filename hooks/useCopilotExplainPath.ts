import { useCallback, useState } from 'react'
import { AivoryWorkflowSpec } from '@/types/workflows'
import { asset } from '@/lib/asset'

export interface ExplainPathResult {
  summary: string
  steps: Array<{
    stepId: string
    explanation: string
  }>
}

export interface UseAivoryExplainPathState {
  isExplaining: boolean
  result: ExplainPathResult | null
  error: string | null
}

export interface UseAivoryExplainPathActions {
  explainPath: (workflow: AivoryWorkflowSpec, targetStepId: string) => Promise<void>
  clearResult: () => void
}

export function useCopilotExplainPath(): UseAivoryExplainPathState & UseAivoryExplainPathActions {
  const [isExplaining, setIsExplaining] = useState(false)
  const [result, setResult] = useState<ExplainPathResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const explainPath = useCallback(
    async (workflow: AivoryWorkflowSpec, targetStepId: string) => {
      setIsExplaining(true)
      setError(null)
      setResult(null)

      try {
        const response = await fetch(asset('/api/workflows/aivory-explain-path'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workflow, targetStepId }),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          const errorMsg = errorData.error || `HTTP ${response.status}`
          const details = errorData.details?.reason || ''
          setError(details ? `${errorMsg}: ${details}` : errorMsg)
          return
        }

        const data: ExplainPathResult = await response.json()
        setResult(data)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to explain workflow path'
        setError(message)
      } finally {
        setIsExplaining(false)
      }
    },
    []
  )

  const clearResult = useCallback(() => {
    setResult(null)
    setError(null)
  }, [])

  return {
    isExplaining,
    result,
    error,
    explainPath,
    clearResult,
  }
}
