/**
 * Aivory Workflow Edit Protocol
 * Defines the request/response contract for AI-powered workflow editing
 */

import { SavedWorkflow } from '@/hooks/useWorkflows'

export type AivoryWorkflowEditMode = 'EDIT_WORKFLOW' | 'EDIT_STEP'

export type AivoryChangeOp = 'ADD_STEP' | 'REMOVE_STEP' | 'UPDATE_STEP' | 'MOVE_STEP'

export interface WorkflowStep {
  step: number
  action: string
  tool: string
  output: string
}

export interface AivoryConstraints {
  maxStepsAdded?: number
  allowedNodeTypes?: string[]
  maxTokensSummary?: number
}

export interface AivoryWorkflowEditRequest {
  mode: AivoryWorkflowEditMode
  workflow: SavedWorkflow
  targetStepId?: string
  instruction: string
  constraints?: AivoryConstraints
  editSessionId?: string
}

export interface AivoryChange {
  op: AivoryChangeOp
  stepId?: string
  afterStepId?: string
  step?: WorkflowStep
  fields?: Partial<WorkflowStep>
}

export interface AivoryWorkflowEditResponse {
  status: 'ok' | 'error'
  changes?: AivoryChange[]
  updatedWorkflow?: SavedWorkflow
  summary?: string[]
  errorCode?: string
  errorMessage?: string
}

export interface CopilotErrorResponse {
  status: 'error'
  errorCode: 'INVALID_REQUEST' | 'TIMEOUT' | 'LLM_ERROR' | 'VALIDATION_ERROR' | 'UNSUPPORTED'
  errorMessage: string
}
