/**
 * WorkflowGenerationFlow Component
 * 
 * Manages the complete workflow generation flow:
 * 1. User enters natural language description
 * 2. API generates workflow spec
 * 3. Nodes and edges are rendered on canvas
 * 4. User can apply or discard changes
 */

'use client'

import React, { useCallback, useState, useEffect } from 'react'
import { WorkflowGenerationPanel } from './WorkflowGenerationPanel'
import { useWorkflowGeneration } from '@/hooks/useWorkflowGeneration'
import { stepsToNodes, edgesToReactFlowEdges } from './WorkflowNodeComponent'
import styles from './WorkflowGenerationFlow.module.css'

export interface WorkflowGenerationFlowProps {
  onApply: (nodes: any[], edges: any[]) => void
  onCancel: () => void
  availableApps?: any[]
  initialPrompt?: string
}

/**
 * WorkflowGenerationFlow
 * 
 * Orchestrates the workflow generation process and displays results.
 */
export const WorkflowGenerationFlow: React.FC<WorkflowGenerationFlowProps> = ({
  onApply,
  onCancel,
  availableApps = [],
  initialPrompt,
}) => {
  const { spec, edges, loading, error, notes, generateWorkflow, clearGeneration } =
    useWorkflowGeneration()
  const [showPreview, setShowPreview] = useState(false)

  // Set initial prompt if provided
  useEffect(() => {
    if (initialPrompt && initialPrompt.trim()) {
      // Note: We can't directly set the prompt to the internal state of WorkflowGenerationPanel
      // So we handle this by triggering the generation automatically when the component mounts
      const initializeWithPrompt = async () => {
        await generateWorkflow(initialPrompt, availableApps, true)
        setShowPreview(true)
      }
      initializeWithPrompt()
    }
  }, []) // Only run once when mounted

  const handleGenerate = useCallback(
    async (intent: string) => {
      await generateWorkflow(intent, availableApps, true)
      setShowPreview(true)
    },
    [generateWorkflow, availableApps]
  )

  const handleApply = useCallback(() => {
    if (!spec) return
    const nodes = stepsToNodes(spec.steps)
    const rfEdges = edgesToReactFlowEdges(edges)
    onApply(nodes, rfEdges)
  }, [spec, edges, onApply])

  const handleCancel = useCallback(() => {
    clearGeneration()
    setShowPreview(false)
    onCancel()
  }, [clearGeneration, onCancel])

  return (
    <div className={styles.container}>
      {!showPreview ? (
        <WorkflowGenerationPanel
          onGenerate={handleGenerate}
          loading={loading}
          error={error}
          onClear={clearGeneration}
          availableApps={availableApps}
          initialPrompt={initialPrompt}
        />
      ) : (
        <div className={styles.preview}>
          {spec && (
            <>
              <div className={styles.header}>
                <h3 className={styles.title}>{spec.name}</h3>
                <button
                  className={styles.closeBtn}
                  onClick={handleCancel}
                  title="Close preview"
                >
                  ✕
                </button>
              </div>

              <div className={styles.content}>
                <div className={styles.section}>
                  <h4 className={styles.sectionTitle}>Description</h4>
                  <p className={styles.description}>{spec.description}</p>
                </div>

                {notes && (
                  <>
                    {notes.summary && (
                      <div className={styles.section}>
                        <h4 className={styles.sectionTitle}>Summary</h4>
                        <p className={styles.text}>{notes.summary}</p>
                      </div>
                    )}

                    {notes.assumptions && notes.assumptions.length > 0 && (
                      <div className={styles.section}>
                        <h4 className={styles.sectionTitle}>Assumptions</h4>
                        <ul className={styles.list}>
                          {notes.assumptions.map((assumption, i) => (
                            <li key={i}>{assumption}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {notes.warnings && notes.warnings.length > 0 && (
                      <div className={styles.section}>
                        <h4 className={styles.sectionTitle}>Warnings</h4>
                        <ul className={styles.warningList}>
                          {notes.warnings.map((warning, i) => (
                            <li key={i}>{warning}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}

                <div className={styles.section}>
                  <h4 className={styles.sectionTitle}>Steps ({spec.steps.length})</h4>
                  <div className={styles.stepsList}>
                    {spec.steps.map((step, i) => (
                      <div key={step.id} className={styles.stepItem}>
                        <div className={styles.stepNumber}>{i + 1}</div>
                        <div className={styles.stepContent}>
                          <div className={styles.stepType}>{step.type}</div>
                          <div className={styles.stepApp}>{step.appId}</div>
                          <div className={styles.stepAction}>{step.actionId}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className={styles.actions}>
                <button className={styles.applyBtn} onClick={handleApply}>
                  ✓ Apply to Canvas
                </button>
                <button className={styles.cancelBtn} onClick={handleCancel}>
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
