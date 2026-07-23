'use client'

import React from 'react'
import styles from './ApplyTargetDialog.module.css'

export interface ApplyTargetDialogProps {
  open: boolean
  workflowName: string
  onUpdateExisting: () => void
  onSaveAsNew: () => void
  onClose: () => void
}

/**
 * Shown when the Copilot's "Apply" is triggered while a workflow is already
 * open — lets the user choose between merging the suggestion into the
 * workflow they're looking at, or forking it off as a separate new draft
 * (the only behavior that existed before this dialog).
 */
export const ApplyTargetDialog: React.FC<ApplyTargetDialogProps> = ({
  open,
  workflowName,
  onUpdateExisting,
  onSaveAsNew,
  onClose,
}) => {
  if (!open) return null

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Apply Copilot suggestion</h2>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className={styles.options}>
          <button type="button" className={styles.optionBtn} onClick={onUpdateExisting}>
            <span className={styles.optionTitle}>Update &ldquo;{workflowName}&rdquo;</span>
            <span className={styles.optionDesc}>Add the generated steps into the workflow you have open.</span>
          </button>
          <button type="button" className={styles.optionBtn} onClick={onSaveAsNew}>
            <span className={styles.optionTitle}>Save as new draft</span>
            <span className={styles.optionDesc}>Keep &ldquo;{workflowName}&rdquo; untouched and create a separate workflow.</span>
          </button>
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.cancelBtn} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

export default ApplyTargetDialog
