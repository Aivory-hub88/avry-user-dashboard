/**
 * AddWithAiraPanel Component
 * 
 * Mini panel for adding follow-up steps with AIRA after a specific node.
 * Anchored to the node and shows context about the current step.
 */

'use client'

import React, { useState, useCallback } from 'react'
import { AivoryWorkflowSpec, WorkflowStep } from '@/types/workflows'
import { useWorkflowExtend } from '@/hooks/useWorkflowExtend'
import { QUICK_ACTION_PRESETS, getPresetInstruction } from '@/config/workflowPresets'
import styles from './AddWithAiraPanel.module.css'

export interface AddWithAiraPanelProps {
  workflow: AivoryWorkflowSpec
  sourceStep: WorkflowStep
  onApply: (result: { newSteps: WorkflowStep[]; newEdges: any[] }) => void
  onCancel: () => void
  onManualAdd: () => void
}

/**
 * AddWithAiraPanel
 * 
 * Shows a mini panel with node context and instruction input.
 * Allows user to ask AIRA to generate follow-up steps or fall back to manual.
 */
export const AddWithAiraPanel: React.FC<AddWithAiraPanelProps> = ({
  workflow,
  sourceStep,
  onApply,
  onCancel,
  onManualAdd,
}) => {
  const { result, loading, error, extendWorkflow, clearExtension } = useWorkflowExtend()
  const [instruction, setInstruction] = useState(
    `Add a follow-up step after this ${sourceStep?.appId ?? sourceStep?.id ?? 'step'} step`
  )

  const handleAskAira = useCallback(async () => {
    await extendWorkflow(workflow, sourceStep.id, instruction)
  }, [extendWorkflow, workflow, sourceStep.id, instruction])

  const handlePresetClick = useCallback((presetId: string) => {
    const presetInstruction = getPresetInstruction(presetId, sourceStep)
    if (presetInstruction) {
      setInstruction(presetInstruction)
    }
  }, [sourceStep])

  const handleApply = useCallback(() => {
    if (result) {
      onApply(result)
      clearExtension()
    }
  }, [result, onApply, clearExtension])

  const handleCancel = useCallback(() => {
    clearExtension()
    onCancel()
  }, [clearExtension, onCancel])

  // Show result view if we have a result
  if (result) {
    return (
      <div className={styles.panel}>
        <div className={styles.header}>
          <h4 className={styles.title}>Follow-up Steps Generated</h4>
          <button className={styles.closeBtn} onClick={handleCancel} title="Close">
            ✕
          </button>
        </div>

        <div className={styles.content}>
          <div className={styles.summary}>{result.summary}</div>

          <div className={styles.stepsList}>
            <h5 className={styles.stepsTitle}>New Steps ({result.newSteps.length})</h5>
            {result.newSteps.map((step, i) => (
              <div key={step.id} className={styles.stepItem}>
                <div className={styles.stepNumber}>{i + 1}</div>
                <div className={styles.stepInfo}>
                  <div className={styles.stepApp}>{step.appId}</div>
                  <div className={styles.stepAction}>{step.actionId}</div>
                </div>
              </div>
            ))}
          </div>

          <div className={styles.actions}>
            <button className={styles.applyBtn} onClick={handleApply}>
              ✓ Apply
            </button>
            <button className={styles.cancelBtn} onClick={handleCancel}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Show input view
  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h4 className={styles.title}>Add with Aivory</h4>
        <button className={styles.closeBtn} onClick={handleCancel} title="Close">
          ✕
        </button>
      </div>

      <div className={styles.content}>
        {/* Node Context */}
        <div className={styles.context}>
          <div className={styles.contextLabel}>After:</div>
          <div className={styles.contextValue}>
            {sourceStep.appId} – {sourceStep.actionId}
          </div>
        </div>

        {/* Quick Action Presets */}
        <div className={styles.presetsSection}>
          <div className={styles.presetsLabel}>Quick actions:</div>
          <div className={styles.presetButtons}>
            {QUICK_ACTION_PRESETS.map((preset) => (
              <button
                key={preset.id}
                className={styles.presetBtn}
                onClick={() => handlePresetClick(preset.id)}
                disabled={loading}
                title={preset.description}
              >
                <span className={styles.presetIcon}>{preset.icon}</span>
                <span>{preset.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Instruction Input */}
        <div className={styles.inputGroup}>
          <label htmlFor="aira-instruction" className={styles.label}>
            What should happen next?
          </label>
          <textarea
            id="aira-instruction"
            className={styles.textarea}
            placeholder="e.g., Send a Slack notification with the result"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            disabled={loading}
            rows={3}
          />
        </div>

        {/* Error Message */}
        {error && (
          <div className={styles.error}>
            <span className={styles.errorIcon}>!</span>
            <span className={styles.errorText}>{error}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className={styles.actions}>
          <button
            className={styles.askAiraBtn}
            onClick={handleAskAira}
            disabled={loading || !instruction.trim()}
            title={loading ? 'Generating...' : 'Ask Aivory to generate follow-up steps'}
          >
            {loading ? (
              <>
                <span className={styles.spinner}>⏳</span>
                Generating...
              </>
            ) : (
              <>
                <span>+</span>
                Ask Aivory
              </>
            )}
          </button>

          <button
            className={styles.manualBtn}
            onClick={onManualAdd}
            disabled={loading}
            title="Add a step manually"
          >
            Manual Step
          </button>

          <button
            className={styles.cancelBtn}
            onClick={handleCancel}
            disabled={loading}
            title="Cancel"
          >
            Cancel
          </button>
        </div>

        {/* Info */}
        <div className={styles.info}>
            <p>Describe what you want to happen next, and Aivory will generate the steps.</p>
        </div>
      </div>
    </div>
  )
}
