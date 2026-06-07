/**
 * Aivory Workflow Edit Protocol
 * Defines the request/response contract for AI-powered workflow editing
 */

import { SavedWorkflow } from '@/hooks/useWorkflows'

export type AiraWorkflowEditMode = 'EDIT_WORKFLOW' | 'EDIT_STEP'

export type AiraChangeOp = 'ADD_STEP' | 'REMOVE_STEP' | 'UPDATE_STEP' | 'MOVE_STEP'

export interface WorkflowStep {
  step: number
  action: string
  tool: string
  output: string
}

export interface AiraConstraints {
  maxStepsAdded?: number
  allowedNodeTypes?: string[]
  maxTokensSummary?: number
}

export interface AiraWorkflowEditRequest {
  mode: AiraWorkflowEditMode
  workflow: SavedWorkflow
  targetStepId?: string
  instruction: string
  constraints?: AiraConstraints
  editSessionId?: string
}

export interface AiraChange {
  op: AiraChangeOp
  stepId?: string
  afterStepId?: string
  step?: WorkflowStep
  fields?: Partial<WorkflowStep>
}

export interface AiraWorkflowEditResponse {
  status: 'ok' | 'error'
  changes?: AiraChange[]
  updatedWorkflow?: SavedWorkflow
  summary?: string[]
  errorCode?: string
  errorMessage?: string
}

export interface AiraErrorResponse {
  status: 'error'
  errorCode: 'INVALID_REQUEST' | 'TIMEOUT' | 'LLM_ERROR' | 'VALIDATION_ERROR' | 'UNSUPPORTED'
  errorMessage: string
}
