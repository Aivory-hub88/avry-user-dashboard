'use client'

import { useState } from 'react'
import { SavedWorkflow } from '@/hooks/useWorkflows'
import {
  requestWorkflowEdit,
  generateChangeDescriptions,
  generateWorkflowSummary,
  AIEditResponse,
} from '@/lib/workflowAIEditor'
import styles from '@/app/workflows/workflows.module.css'

interface WorkflowAIEditorProps {
  workflow: SavedWorkflow
  onClose: () => void
  onApply: (updated: SavedWorkflow) => void
}

export function WorkflowAIEditor({ workflow, onClose, onApply }: WorkflowAIEditorProps) {
  const [instruction, setInstruction] = useState('')
  const [loading, setLoading] = useState(false)
  const [aiResponse, setAiResponse] = useState<AIEditResponse | null>(null)
  const [error, setError] = useState('')

  const handleGeneratePreview = async () => {
    if (!instruction.trim()) return

    setLoading(true)
    setError('')

    try {
      const response = await requestWorkflowEdit(workflow, instruction)
      setAiResponse(response)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to generate preview. Please try again.'
      )
      console.error('[WorkflowAIEditor] Error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleApply = () => {
    if (aiResponse?.updatedWorkflow) {
      onApply(aiResponse.updatedWorkflow)
    }
  }

  const handleBack = () => {
    setAiResponse(null)
    setInstruction('')
    setError('')
  }

  const changeDescriptions = aiResponse ? generateChangeDescriptions(aiResponse.changes) : []

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.aiModal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.aiModalHeader}>
          <span className={styles.aiModalTitle}>Edit Workflow with AI</span>
          <button className={styles.rightPanelClose} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {!aiResponse ? (
          <>
            {/* Input Phase */}
            <div className={styles.aiEditorPhase}>
              <p className={styles.aiModalHint}>
                Describe how you want to change this workflow in plain language.
              </p>

              {/* Workflow Summary */}
              <div className={styles.aiWorkflowSummary}>
                <div className={styles.aiSummaryLabel}>Current workflow:</div>
                <div className={styles.aiSummaryContent}>
                  {generateWorkflowSummary(workflow)
                    .split('\n')
                    .map((line, i) => (
                      line.trim() && (
                        <div key={i} className={styles.aiSummaryLine}>
                          {line}
                        </div>
                      )
                    ))}
                </div>
              </div>

              {/* Input Textarea */}
              <textarea
                className={styles.aiModalInput}
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder='e.g. "After the AI validation step, add a step that sends an email to the onboarding team"'
                rows={5}
                autoFocus
              />

              {error && <p className={styles.aiModalError}>{error}</p>}

              {/* Actions */}
              <div className={styles.aiModalActions}>
                <button className={styles.aiModalCancel} onClick={onClose}>
                  Cancel
                </button>
                <button
                  className={styles.aiModalSubmit}
                  onClick={handleGeneratePreview}
                  disabled={loading || !instruction.trim()}
                >
                  {loading ? 'Analyzing…' : 'Preview Changes'}
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Preview Phase */}
            <div className={styles.aiEditorPhase}>
              <p className={styles.aiModalHint}>Review the proposed changes below.</p>

              {/* Changes List */}
              <div className={styles.aiChangesList}>
                <div className={styles.aiChangesLabel}>Proposed changes:</div>
                {changeDescriptions.length > 0 ? (
                  <ul className={styles.aiChangeItems}>
                    {changeDescriptions.map((desc, i) => (
                      <li key={i} className={styles.aiChangeItem}>
                        {desc}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.aiNoChanges}>No changes detected</p>
                )}
              </div>

              {/* Summary */}
              {aiResponse.summary && (
                <div className={styles.aiSummaryBox}>
                  <div className={styles.aiSummaryLabel}>Summary:</div>
                  <p className={styles.aiSummaryText}>{aiResponse.summary}</p>
                </div>
              )}

              {/* Actions */}
              <div className={styles.aiModalActions}>
                <button className={styles.aiModalCancel} onClick={handleBack}>
                  Back
                </button>
                <button className={styles.aiModalSubmit} onClick={handleApply}>
                  Apply Changes
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
