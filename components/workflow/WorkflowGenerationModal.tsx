/**
 * WorkflowGenerationModal Component
 * 
 * Modal wrapper for the workflow generation flow.
 * Displays generation panel and preview in a modal overlay.
 */

'use client'

import React, { useCallback } from 'react'
import { WorkflowGenerationFlow } from './WorkflowGenerationFlow'
import styles from './WorkflowGenerationModal.module.css'

export interface WorkflowGenerationModalProps {
  isOpen: boolean
  onClose: () => void
  onApply: (nodes: any[], edges: any[]) => void
  availableApps?: any[]
  initialPrompt?: string
}

/**
 * WorkflowGenerationModal
 * 
 * Displays the workflow generation flow in a modal overlay.
 */
export const WorkflowGenerationModal: React.FC<WorkflowGenerationModalProps> = ({
  isOpen,
  onClose,
  onApply,
  availableApps = [],
  initialPrompt,
}) => {
  const handleApply = useCallback(
    (nodes: any[], edges: any[]) => {
      onApply(nodes, edges)
      onClose()
    },
    [onApply, onClose]
  )

  if (!isOpen) return null

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <WorkflowGenerationFlow
          onApply={handleApply}
          onCancel={onClose}
          availableApps={availableApps}
          initialPrompt={initialPrompt}
        />
      </div>
    </div>
  )
}
