'use client'

import React, { useState, useCallback } from 'react'
import { WorkflowGenerationResult } from '@/types/workflows'
import { storeWorkflowSpec } from '@/lib/workflowHandoff'
import styles from './DesignWorkflowMode.module.css'

export interface DesignWorkflowModeProps {
  onClose: () => void
}

export const DesignWorkflowMode: React.FC<DesignWorkflowModeProps> = ({ onClose }) => {
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<WorkflowGenerationResult | null>(null)

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch('/api/workflows/ai-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent: prompt.trim(),
          availableApps: [],
          useConnections: false,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to generate workflow')
      }

      const data: WorkflowGenerationResult = await response.json()
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }, [prompt])

  const handleCreateWorkflow = useCallback(() => {
    if (!result) return

    const success = storeWorkflowSpec(result.spec)
    if (success) {
      window.location.href = '/workflows?fromConsole=true'
    } else {
      setError('Failed to save workflow. Please try again.')
    }
  }, [result])

  // Input view
  if (!result) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h2 className={styles.title}>Design Workflow</h2>
          <button className={styles.closeBtn} onClick={onClose} title="Close">
            ✕
          </button>
        </div>

        <div className={styles.content}>
          <div className={styles.description}>
            Describe your automation in natural language, and Aivory will generate a workflow for you.
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor="workflow-prompt" className={styles.label}>
              What automation do you want to build?
            </label>
            <textarea
              id="workflow-prompt"
              className={styles.textarea}
              placeholder="e.g., When a new lead is added to Salesforce, send them a welcome email and create a task in Asana"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={loading}
              rows={5}
            />
            <div className={styles.charCount}>
              {prompt.length} / 500
            </div>
          </div>

          {error && (
            <div className={styles.error}>
              <span className={styles.errorIcon}>!</span>
              <span className={styles.errorText}>{error}</span>
            </div>
          )}

          <div className={styles.actions}>
            <button
              className={styles.generateBtn}
              onClick={handleGenerate}
              disabled={loading || !prompt.trim() || prompt.length > 500}
              title={loading ? 'Generating...' : 'Generate workflow'}
            >
              {loading ? (
                <>
                  <span className={styles.spinner}>⏳</span>
                  Generating...
                </>
              ) : (
                <>
                  <span>+</span>
                  Generate Workflow
                </>
              )}
            </button>

            <button
              className={styles.cancelBtn}
              onClick={onClose}
              disabled={loading}
              title="Cancel"
            >
              Cancel
            </button>
          </div>

          <div className={styles.info}>
            <p>Be specific about the apps, triggers, and actions you want to include.</p>
          </div>
        </div>
      </div>
    )
  }

  // Preview view
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>Workflow Preview</h2>
        <button className={styles.closeBtn} onClick={onClose} title="Close">
          ✕
        </button>
      </div>

      <div className={styles.content}>
        {/* Summary */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Summary</h3>
          <div className={styles.summary}>{result.notes.summary}</div>
        </div>

        {/* Assumptions */}
        {result.notes.assumptions.length > 0 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Assumptions</h3>
            <ul className={styles.list}>
              {result.notes.assumptions.map((assumption, i) => (
                <li key={i} className={styles.listItem}>
                  {assumption}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Warnings */}
        {result.notes.warnings.length > 0 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Warnings</h3>
            <ul className={styles.list}>
              {result.notes.warnings.map((warning, i) => (
                <li key={i} className={styles.listItem}>
                  {warning}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Steps */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Workflow Steps ({result.spec.steps.length})</h3>
          <div className={styles.stepsList}>
            {result.spec.steps.map((step, i) => (
              <div key={step.id} className={styles.stepItem}>
                <div className={styles.stepNumber}>{i + 1}</div>
                <div className={styles.stepContent}>
                  <div className={styles.stepApp}>{step.appId}</div>
                  <div className={styles.stepAction}>{step.actionId}</div>
                  <div className={styles.stepType}>{step.type}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className={styles.error}>
            <span className={styles.errorIcon}>!</span>
            <span className={styles.errorText}>{error}</span>
          </div>
        )}

        <div className={styles.actions}>
          <button
            className={styles.createBtn}
            onClick={handleCreateWorkflow}
            title="Create this workflow in Workflow tab"
          >
            ✓ Create this workflow in Workflow tab
          </button>

          <button
            className={styles.backBtn}
            onClick={() => setResult(null)}
            title="Go back to design"
          >
            ← Back
          </button>

          <button
            className={styles.cancelBtn}
            onClick={onClose}
            title="Cancel"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
