'use client'

import { useState } from 'react'
import { SavedWorkflow } from '@/hooks/useWorkflows'
import { requestStepEdit } from '@/lib/workflowAIEditor'
import type { AiraErrorResponse } from '@/types/aira'

interface StepAiraEditModalProps {
  stepIndex: number
  stepAction: string
  stepTool?: string
  workflow: SavedWorkflow
  onClose: () => void
  onApply: (updatedWorkflow: SavedWorkflow) => void
}

export function StepAiraEditModal({
  stepIndex,
  stepAction,
  stepTool,
  workflow,
  onClose,
  onApply,
}: StepAiraEditModalProps) {
  const [instruction, setInstruction] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleEdit = async () => {
    if (!instruction.trim()) return

    setLoading(true)
    setError('')

    try {
      const response = await requestStepEdit(
        workflow.steps[stepIndex],
        instruction,
        stepIndex,
        workflow
      )

      // Apply the updated step to the workflow
      const updatedSteps = [...workflow.steps]
      updatedSteps[stepIndex] = response.updatedStep
      const updatedWorkflow = { ...workflow, steps: updatedSteps }

      onApply(updatedWorkflow)
      onClose()
    } catch (err: any) {
      const errorData = err as any
      if (errorData?.errorCode) {
        const airaError = errorData as AiraErrorResponse
        if (airaError.errorCode === 'UNSUPPORTED') {
          setError("Aivory can't safely perform that change. Try a more specific instruction.")
        } else if (airaError.errorCode === 'TIMEOUT' || airaError.errorCode === 'LLM_ERROR') {
          setError('Aivory ran into an issue. Please try again.')
        } else {
          setError(airaError.errorMessage || 'An error occurred')
        }
      } else {
        setError(err instanceof Error ? err.message : 'An error occurred')
      }
      console.error('[StepAiraEditModal] Error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        backdropFilter: 'blur(2px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#353531',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12,
          padding: 24,
          maxWidth: 500,
          width: '90%',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 300, color: '#d4d2ce' }}>
            Edit Step {stepIndex + 1} with Aivory
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#a8a6a2',
              cursor: 'pointer',
              fontSize: 18,
              padding: 0,
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: '#a8a6a2', marginBottom: 8 }}>Current step:</div>
          <div style={{ fontSize: 13, color: '#f1f5f9', marginBottom: 4 }}>{stepAction}</div>
          {stepTool && <div style={{ fontSize: 11, color: '#94a3b8' }}>{stepTool}</div>}
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#a8a6a2', marginBottom: 8 }}>
            How should Aivory improve this step?
          </label>
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="e.g. Make this email more formal and add a CTA"
            style={{
              width: '100%',
              minHeight: 80,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8,
              padding: 10,
              color: '#f1f5f9',
              fontSize: 13,
              fontFamily: 'inherit',
              boxSizing: 'border-box',
              resize: 'vertical',
            }}
            autoFocus
          />
        </div>

        <div style={{ fontSize: 12, color: '#5a5a58', marginBottom: 16, lineHeight: 1.5 }}>
          Aivory will adjust this step while keeping the rest of the workflow consistent.
        </div>

        {error && (
          <div style={{ fontSize: 12, color: '#f87171', marginBottom: 16, padding: 10, background: 'rgba(248,113,113,0.1)', borderRadius: 6 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={loading}
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8,
              padding: '8px 16px',
              color: '#a8a6a2',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: 13,
              fontFamily: 'inherit',
              transition: 'all 0.15s',
              opacity: loading ? 0.5 : 1,
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                const btn = e.currentTarget as HTMLButtonElement
                btn.style.background = 'rgba(255,255,255,0.07)'
                btn.style.color = '#e8e6e1'
              }
            }}
            onMouseLeave={(e) => {
              const btn = e.currentTarget as HTMLButtonElement
              btn.style.background = 'rgba(255,255,255,0.04)'
              btn.style.color = '#a8a6a2'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleEdit}
            disabled={loading || !instruction.trim()}
            style={{
              background: '#353532',
              border: '1px solid #666864',
              borderRadius: 20,
              padding: '8px 16px',
              color: '#f7f7f7',
              cursor: loading || !instruction.trim() ? 'not-allowed' : 'pointer',
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'inherit',
              opacity: loading || !instruction.trim() ? 0.5 : 1,
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              if (!loading && instruction.trim()) {
                const btn = e.currentTarget as HTMLButtonElement
                btn.style.background = '#444440'
              }
            }}
            onMouseLeave={(e) => {
              const btn = e.currentTarget as HTMLButtonElement
              btn.style.background = '#353532'
            }}
          >
            {loading ? 'Editing…' : 'Ask Aivory to edit this step'}
          </button>
        </div>
      </div>
    </div>
  )
}
