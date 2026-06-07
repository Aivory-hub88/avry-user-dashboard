/**
 * ConsoleWorkflowDesigner Component
 * 
 * Text-first workflow design interface for the AI Console.
 * Allows users to describe workflows and see explanations before creating them.
 */

import React, { useState, useCallback } from 'react'
import styles from './ConsoleWorkflowDesigner.module.css'
import { AivoryWorkflowSpec, AivoryWorkflowEdge } from '@/types/workflows'

export interface ConsoleWorkflowDesignerProps {
  onWorkflowCreated?: (spec: AivoryWorkflowSpec, edges: AivoryWorkflowEdge[]) => void
}

interface ExplanationData {
  purpose: string
  steps: Array<{
    id: string
    title: string
    description: string
  }>
  dataFlow: string
  assumptions: string[]
  limitations: string[]
}

/**
 * ConsoleWorkflowDesigner component
 * 
 * Provides a text-first interface for designing workflows with AI guidance.
 */
export const ConsoleWorkflowDesigner: React.FC<ConsoleWorkflowDesignerProps> = ({
  onWorkflowCreated,
}) => {
  const [description, setDescription] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [explanation, setExplanation] = useState<ExplanationData | null>(null)
  const [generatedSpec, setGeneratedSpec] = useState<AivoryWorkflowSpec | null>(null)
  const [generatedEdges, setGeneratedEdges] = useState<AivoryWorkflowEdge[]>([])

  const handleGenerate = useCallback(async () => {
    if (!description.trim()) {
      setError('Please describe your workflow')
      return
    }

    setIsLoading(true)
    setError(null)
    setExplanation(null)

    try {
      // Call ai-suggest endpoint
      const response = await fetch('/api/workflows/ai-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent: description,
          useConnections: true,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to generate workflow')
      }

      const result = await response.json()
      setGeneratedSpec(result.spec)
      setGeneratedEdges(result.edges)

      // Now call copilot to get explanation
      const explainResponse = await fetch('/api/workflows/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'explain',
          currentWorkflow: result.spec,
        }),
      })

      if (explainResponse.ok) {
        const explainData = await explainResponse.json()
        if (explainData.mode === 'explain') {
          setExplanation({
            purpose: explainData.purpose,
            steps: explainData.steps || [],
            dataFlow: explainData.dataFlow || '',
            assumptions: explainData.assumptions || [],
            limitations: explainData.limitations || [],
          })
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate workflow')
    } finally {
      setIsLoading(false)
    }
  }, [description])

  const handleCreateInWorkflowTab = useCallback(() => {
    if (!generatedSpec) return

    // Store spec in localStorage
    const handoffData = {
      spec: generatedSpec,
      timestamp: Date.now(),
    }
    localStorage.setItem('pendingWorkflowSpec', JSON.stringify(handoffData))

    // Navigate to Workflow Tab
    window.location.href = '/workflows?fromConsole=true'

    // Call callback if provided
    onWorkflowCreated?.(generatedSpec, generatedEdges)
  }, [generatedSpec, generatedEdges, onWorkflowCreated])

  return (
    <div className={styles.container}>
      {!explanation ? (
        // Generation form
        <div className={styles.form}>
          <h2 className={styles.title}>Design Your Workflow</h2>

          <div className={styles.inputGroup}>
            <label htmlFor="workflow-description" className={styles.label}>
              Describe what you want to automate
            </label>
            <textarea
              id="workflow-description"
              className={styles.textarea}
              placeholder="e.g., When I receive an email with attachments, save them to Google Drive and notify me on Slack"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isLoading}
              rows={5}
            />
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <button
            className={styles.generateButton}
            onClick={handleGenerate}
            disabled={isLoading || !description.trim()}
            aria-busy={isLoading}
          >
            {isLoading ? (
              <>
                <span className={styles.spinner} />
                Generating...
              </>
            ) : (
              'Generate Workflow'
            )}
          </button>
        </div>
      ) : (
        // Explanation display
        <div className={styles.explanation}>
          <button
            className={styles.backButton}
            onClick={() => {
              setExplanation(null)
              setGeneratedSpec(null)
              setGeneratedEdges([])
            }}
          >
            ← Back
          </button>

          <h2 className={styles.title}>{generatedSpec?.name || 'Generated Workflow'}</h2>

          {/* Purpose */}
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Purpose</h3>
            <p className={styles.sectionContent}>{explanation.purpose}</p>
          </div>

          {/* Steps */}
          {explanation.steps.length > 0 && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Steps</h3>
              <ol className={styles.stepsList}>
                {explanation.steps.map((step, index) => (
                  <li key={step.id || index} className={styles.stepItem}>
                    <div className={styles.stepTitle}>{step.title}</div>
                    <div className={styles.stepDescription}>{step.description}</div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Data Flow */}
          {explanation.dataFlow && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Data Flow</h3>
              <p className={styles.sectionContent}>{explanation.dataFlow}</p>
            </div>
          )}

          {/* Assumptions */}
          {explanation.assumptions.length > 0 && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Assumptions</h3>
              <ul className={styles.list}>
                {explanation.assumptions.map((assumption, index) => (
                  <li key={index}>{assumption}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Limitations */}
          {explanation.limitations.length > 0 && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Limitations</h3>
              <ul className={styles.list}>
                {explanation.limitations.map((limitation, index) => (
                  <li key={index}>{limitation}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Action buttons */}
          <div className={styles.actionButtons}>
            <button
              className={styles.createButton}
              onClick={handleCreateInWorkflowTab}
            >
              Create in Workflow Tab →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default ConsoleWorkflowDesigner
