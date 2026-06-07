/**
 * useWorkflowGeneration Hook
 * 
 * Manages workflow generation state and API calls for natural language workflow creation.
 * Handles loading, error states, and canvas updates.
 */

import { useCallback, useState } from 'react'
import { AivoryWorkflowSpec, AivoryWorkflowEdge, WorkflowGenerationResult } from '@/types/workflows'

export interface UseWorkflowGenerationState {
  spec: AivoryWorkflowSpec | null
  edges: AivoryWorkflowEdge[]
  loading: boolean
  error: string | null
  notes: {
    summary: string
    assumptions: string[]
    warnings: string[]
  } | null
}

export interface UseWorkflowGenerationActions {
  generateWorkflow: (intent: string, availableApps?: any[], useConnections?: boolean) => Promise<void>
  clearGeneration: () => void
  setError: (error: string | null) => void
}

export function useWorkflowGeneration(): UseWorkflowGenerationState & UseWorkflowGenerationActions {
  const [spec, setSpec] = useState<AivoryWorkflowSpec | null>(null)
  const [edges, setEdges] = useState<AivoryWorkflowEdge[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState<{
    summary: string
    assumptions: string[]
    warnings: string[]
  } | null>(null)

  const generateWorkflow = useCallback(
    async (intent: string, availableApps: any[] = [], useConnections: boolean = true) => {
      if (!intent.trim()) {
        setError('Please enter a workflow description')
        return
      }

      setLoading(true)
      setError(null)
      setSpec(null)
      setEdges([])
      setNotes(null)

      try {
        const response = await fetch('/api/workflows/ai-suggest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            intent: intent.trim(),
            availableApps,
            useConnections,
          }),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          const errorMsg = errorData.error || `HTTP ${response.status}`
          const details = errorData.details?.reason || ''
          setError(details ? `${errorMsg}: ${details}` : errorMsg)
          return
        }

        const result: WorkflowGenerationResult = await response.json()
        setSpec(result.spec)
        setEdges(result.edges || [])
        setNotes(result.notes || null)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to generate workflow'
        setError(message)
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const clearGeneration = useCallback(() => {
    setSpec(null)
    setEdges([])
    setError(null)
    setNotes(null)
  }, [])

  return {
    spec,
    edges,
    loading,
    error,
    notes,
    generateWorkflow,
    clearGeneration,
    setError,
  }
}
