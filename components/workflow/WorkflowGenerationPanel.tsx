/**
 * WorkflowGenerationPanel Component
 * 
 * UI panel for generating workflows from natural language descriptions.
 * Displays input field, generation button, and loading/error states.
 */

'use client'

import React, { useState, useCallback, useEffect } from 'react'
import styles from './WorkflowGenerationPanel.module.css'

export interface WorkflowGenerationPanelProps {
  onGenerate: (intent: string, availableApps?: any[], useConnections?: boolean) => Promise<void>
  loading?: boolean
  error?: string | null
  onClear?: () => void
  availableApps?: any[]
  initialPrompt?: string
}

/**
 * WorkflowGenerationPanel
 * 
 * Provides a text input for natural language workflow descriptions
 * and triggers generation via the parent hook.
 */
export const WorkflowGenerationPanel: React.FC<WorkflowGenerationPanelProps> = ({
  onGenerate,
  loading = false,
  error = null,
  onClear,
  availableApps = [],
  initialPrompt,
}) => {
  const [intent, setIntent] = useState('')
  const [useConnections, setUseConnections] = useState(true)
  const [charCount, setCharCount] = useState(0)

  // Set the initial prompt if provided
  useEffect(() => {
    if (initialPrompt && initialPrompt.trim() && !intent) {
      setIntent(initialPrompt)
      setCharCount(initialPrompt.length)
    }
  }, [initialPrompt]);

  const handleIntentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setIntent(value)
    setCharCount(value.length)
  }, [])

  const handleGenerate = useCallback(async () => {
    await onGenerate(intent, availableApps, useConnections)
  }, [intent, onGenerate, availableApps, useConnections])

  const handleClear = useCallback(() => {
    setIntent('')
    setCharCount(0)
    onClear?.()
  }, [onClear])

  const isValid = intent.trim().length > 0
  const minChars = 10
  const maxChars = 500

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>Generate Workflow</h3>
        <p className={styles.subtitle}>Describe your automation in natural language</p>
      </div>

      <div className={styles.content}>
        {/* Description Input */}
        <div className={styles.inputGroup}>
          <label htmlFor="workflow-intent" className={styles.label}>
            Workflow Description
          </label>
          <textarea
            id="workflow-intent"
            className={styles.textarea}
            placeholder="e.g., When I receive an email from my boss, save the attachment to Google Drive and send me a Slack notification"
            value={intent}
            onChange={handleIntentChange}
            disabled={loading}
            rows={4}
          />
          <div className={styles.charCounter}>
            <span className={charCount < minChars ? styles.warning : ''}>
              {charCount} / {maxChars}
            </span>
          </div>
        </div>

        {/* Options */}
        <div className={styles.options}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={useConnections}
              onChange={(e) => setUseConnections(e.target.checked)}
              disabled={loading || availableApps.length === 0}
            />
            <span>Use my connected apps</span>
          </label>
          {availableApps.length === 0 && (
            <p className={styles.hint}>No connected apps available</p>
          )}
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
            className={styles.generateBtn}
            onClick={handleGenerate}
            disabled={!isValid || loading || charCount < minChars}
            title={
              charCount < minChars
                ? `Please enter at least ${minChars} characters`
                : !isValid
                  ? 'Please enter a workflow description'
                  : 'Generate workflow from description'
            }
          >
            {loading ? (
              <>
                <span className={styles.spinner}>⏳</span>
                Generating...
              </>
            ) : (
              <>
                <span>+</span>
                Generate
              </>
            )}
          </button>

          {intent && (
            <button
              className={styles.clearBtn}
              onClick={handleClear}
              disabled={loading}
              title="Clear input"
            >
              Clear
            </button>
          )}
        </div>

        {/* Info */}
        <div className={styles.info}>
          <p>
            Tip: Be specific about triggers, apps, and desired outcomes for better results.
          </p>
        </div>
      </div>
    </div>
  )
}
