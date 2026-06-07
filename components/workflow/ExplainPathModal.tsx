'use client'

import React, { useEffect } from 'react'
import { AivoryWorkflowSpec, WorkflowStep } from '@/types/workflows'
import { useAiraExplainPath } from '@/hooks/useAiraExplainPath'
import styles from './ExplainPathModal.module.css'

export interface ExplainPathModalProps {
  workflow: AivoryWorkflowSpec
  targetStep: WorkflowStep
  onClose: () => void
}

export const ExplainPathModal: React.FC<ExplainPathModalProps> = ({
  workflow,
  targetStep,
  onClose,
}) => {
  const { isExplaining, result, error, explainPath, clearResult } = useAiraExplainPath()

  useEffect(() => {
    explainPath(workflow, targetStep.id)
  }, [workflow, targetStep.id, explainPath])

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.title}>
            <span className={styles.icon}>i</span>
            Explain Path to {targetStep.appId}
          </div>
          <button className={styles.closeBtn} onClick={onClose} title="Close">
            ✕
          </button>
        </div>

        {/* Content */}
        <div className={styles.content}>
          {isExplaining ? (
            <div className={styles.loading}>
              <div className={styles.spinner} />
              <p>Analyzing workflow path...</p>
            </div>
          ) : error ? (
            <div className={styles.error}>
              <span className={styles.errorIcon}>!</span>
              <span className={styles.errorText}>{error}</span>
            </div>
          ) : result ? (
            <>
              {/* Summary */}
              <div className={styles.summary}>{result.summary}</div>

              {/* Steps */}
              <div className={styles.steps}>
                <h4 className={styles.stepsTitle}>Workflow Path</h4>
                {result.steps.map((step, idx) => (
                  <div
                    key={step.stepId}
                    className={`${styles.stepItem} ${
                      step.stepId === targetStep.id ? styles.targetStep : ''
                    }`}
                  >
                    <div className={styles.stepNumber}>{idx + 1}</div>
                    <div className={styles.stepContent}>
                      <div className={styles.stepId}>{step.stepId}</div>
                      <div className={styles.stepExplanation}>{step.explanation}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button className={styles.closeActionBtn} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
