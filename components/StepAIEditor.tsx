'use client'

import { useState } from 'react'
import { SavedWorkflow } from '@/hooks/useWorkflows'
import { requestStepEdit, StepEditResponse } from '@/lib/workflowAIEditor'
import styles from '@/app/workflows/workflows.module.css'

interface StepAIEditorProps {
  step: SavedWorkflow['steps'][0]
  stepIndex: number
  workflow?: SavedWorkflow
  onClose: () => void
  onApply: (updatedStep: SavedWorkflow['steps'][0]) => void
}

export function StepAIEditor({ step, stepIndex, workflow, onClose, onApply }: StepAIEditorProps) {
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [aiResponse, setAiResponse] = useState<StepEditResponse | null>(null)
  const [error, setError] = useState('')

  const handleGenerateConfig = async () => {
    if (!description.trim()) return

    setLoading(true)
    setError('')

    try {
      const response = await requestStepEdit(step, description, stepIndex, workflow)
      setAiResponse(response)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to generate step config. Please try again.'
      )
      console.error('[StepAIEditor] Error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleApply = () => {
    if (aiResponse?.updatedStep) {
      onApply(aiResponse.updatedStep)
    }
  }

  const handleReset = () => {
    setAiResponse(null)
    setDescription('')
    setError('')
  }

  return (
    <div className={styles.stepAIEditorContainer}>
      {!aiResponse ? (
        <>
          {/* Input Phase */}
          <div className={styles.stepAIEditorPhase}>
            <div className={styles.stepAILabel}>Describe this step in plain language:</div>

            {/* Current Step Summary */}
            <div className={styles.stepAISummary}>
              <div className={styles.stepAISummaryLabel}>Current step:</div>
              <div className={styles.stepAISummaryContent}>
                <div>{step.action}</div>
                {step.tool && <div className={styles.stepAISummaryMeta}>{step.tool}</div>}
                {step.output && <div className={styles.stepAISummaryMeta}>{step.output}</div>}
              </div>
            </div>

            {/* Input Textarea */}
            <textarea
              className={styles.stepAIInput}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder='e.g. "Send an email to the client with the generated report"'
              rows={3}
              autoFocus
            />

            {error && <p className={styles.stepAIError}>{error}</p>}

            {/* Actions */}
            <div className={styles.stepAIActions}>
              <button className={styles.stepAICancel} onClick={onClose}>
                Cancel
              </button>
              <button
                className={styles.stepAISubmit}
                onClick={handleGenerateConfig}
                disabled={loading || !description.trim()}
              >
                {loading ? 'Generating…' : 'Generate Config'}
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Preview Phase */}
          <div className={styles.stepAIEditorPhase}>
            <div className={styles.stepAILabel}>Updated step configuration:</div>

            {/* Changes Summary */}
            {aiResponse.changes.length > 0 && (
              <div className={styles.stepAIChanges}>
                <div className={styles.stepAIChangesLabel}>Changes:</div>
                <ul className={styles.stepAIChangesList}>
                  {aiResponse.changes.map((change, i) => (
                    <li key={i} className={styles.stepAIChangeItem}>
                      {change}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Updated Step Preview */}
            <div className={styles.stepAIPreview}>
              <div className={styles.stepAIPreviewLabel}>New configuration:</div>
              <div className={styles.stepAIPreviewContent}>
                <div className={styles.stepAIPreviewField}>
                  <span className={styles.stepAIPreviewFieldLabel}>Action:</span>
                  <span className={styles.stepAIPreviewFieldValue}>{aiResponse.updatedStep.action}</span>
                </div>
                {aiResponse.updatedStep.tool && (
                  <div className={styles.stepAIPreviewField}>
                    <span className={styles.stepAIPreviewFieldLabel}>Tool:</span>
                    <span className={styles.stepAIPreviewFieldValue}>{aiResponse.updatedStep.tool}</span>
                  </div>
                )}
                {aiResponse.updatedStep.output && (
                  <div className={styles.stepAIPreviewField}>
                    <span className={styles.stepAIPreviewFieldLabel}>Output:</span>
                    <span className={styles.stepAIPreviewFieldValue}>{aiResponse.updatedStep.output}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Explanation */}
            {aiResponse.explanation && (
              <div className={styles.stepAIExplanation}>
                <div className={styles.stepAIExplanationLabel}>What changed:</div>
                <p className={styles.stepAIExplanationText}>{aiResponse.explanation}</p>
              </div>
            )}

            {/* Actions */}
            <div className={styles.stepAIActions}>
              <button className={styles.stepAICancel} onClick={handleReset}>
                Back
              </button>
              <button className={styles.stepAISubmit} onClick={handleApply}>
                Apply Update
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
