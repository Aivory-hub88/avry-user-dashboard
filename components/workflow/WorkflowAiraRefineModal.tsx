'use client'

import { useState } from 'react'
import { SavedWorkflow } from '@/hooks/useWorkflows'
import { requestWorkflowEdit } from '@/lib/workflowAIEditor'
import type { AiraErrorResponse } from '@/types/aira'

interface WorkflowAiraRefineModalProps {
  workflow: SavedWorkflow
  onClose: () => void
  onApply: (updatedWorkflow: SavedWorkflow) => void
}

export function WorkflowAiraRefineModal({
  workflow,
  onClose,
  onApply,
}: WorkflowAiraRefineModalProps) {
  const [instruction, setInstruction] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<{ summary: string[] } | null>(null)

  const handleRefine = async () => {
    if (!instruction.trim()) return

    setLoading(true)
    setError('')

    try {
      const response = await requestWorkflowEdit(workflow, instruction)

      // Show preview with summary
      setPreview({
        summary: Array.isArray(response.summary) ? response.summary : [response.summary],
      })

      // Store the updated workflow for apply
      ;(window as any).__airaRefineWorkflow = response.updatedWorkflow
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
      console.error('[WorkflowAiraRefineModal] Error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleApply = () => {
    const updatedWorkflow = (window as any).__airaRefineWorkflow
    if (updatedWorkflow) {
      onApply(updatedWorkflow)
      onClose()
    }
  }

  const handleDiscard = () => {
    setPreview(null)
    setInstruction('')
    setError('')
  }

  const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    const btn = e.currentTarget
    btn.style.background = 'rgba(255,255,255,0.07)'
    btn.style.color = '#e8e6e1'
  }

  const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    const btn = e.currentTarget
    btn.style.background = 'rgba(255,255,255,0.04)'
    btn.style.color = '#a8a6a2'
  }

  const handleApplyMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    const btn = e.currentTarget
    btn.style.background = '#444440'
  }

  const handleApplyMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    const btn = e.currentTarget
    btn.style.background = '#353532'
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
          maxWidth: 550,
          width: '90%',
          maxHeight: '80vh',
          overflowY: 'auto',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {!preview ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 300, color: '#d4d2ce' }}>
                Refine Workflow with Aivory
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
              <label style={{ display: 'block', fontSize: 12, color: '#a8a6a2', marginBottom: 8 }}>
                Describe how you want Aivory to improve this workflow
              </label>
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="e.g. add error handling, simplify steps, adjust notifications"
                style={{
                  width: '100%',
                  minHeight: 100,
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
              Aivory may add, remove, or reorder steps. Step numbering will be kept consistent by the backend.
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
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
              >
                Cancel
              </button>
              <button
                onClick={handleRefine}
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
                onMouseEnter={handleApplyMouseEnter}
                onMouseLeave={handleApplyMouseLeave}
              >
                {loading ? 'Analyzing…' : 'Ask Aivory to refine workflow'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 300, color: '#d4d2ce' }}>
                Proposed Changes
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
              <div style={{ fontSize: 12, color: '#a8a6a2', marginBottom: 8 }}>Changes:</div>
              <ul style={{ margin: 0, paddingLeft: 20, color: '#f1f5f9', fontSize: 13, lineHeight: 1.6 }}>
                {preview.summary.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>

            <div style={{ fontSize: 12, color: '#5a5a58', marginBottom: 16, padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 6, lineHeight: 1.5 }}>
              Review the changes above. You can apply them or discard and try again.
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={handleDiscard}
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 8,
                  padding: '8px 16px',
                  color: '#a8a6a2',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontFamily: 'inherit',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
              >
                Discard
              </button>
              <button
                onClick={handleApply}
                style={{
                  background: '#353532',
                  border: '1px solid #666864',
                  borderRadius: 20,
                  padding: '8px 16px',
                  color: '#f7f7f7',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={handleApplyMouseEnter}
                onMouseLeave={handleApplyMouseLeave}
              >
                Apply changes
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
