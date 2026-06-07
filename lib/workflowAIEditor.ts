/**
 * Workflow AI Editor
 * Handles natural language workflow editing via AI
 * Provides workflow-level and step-level AI assistance
 */

import { SavedWorkflow } from '@/hooks/useWorkflows'

export interface WorkflowChange {
  type: 'ADD_STEP' | 'REMOVE_STEP' | 'UPDATE_STEP' | 'REORDER_STEPS' | 'UPDATE_TRIGGER'
  description: string
  stepIndex?: number
  stepData?: any
}

export interface AIEditResponse {
  updatedWorkflow: SavedWorkflow
  changes: WorkflowChange[]
  summary: string
}

export interface StepEditResponse {
  updatedStep: SavedWorkflow['steps'][0]
  changes: string[]
  explanation: string
}

/**
 * Request workflow-level changes from AI
 * Sends current workflow + user instruction to Aivory endpoint
 * Returns proposed updated workflow with change summary
 */
export async function requestWorkflowEdit(
  workflow: SavedWorkflow,
  userInstruction: string
): Promise<AIEditResponse> {
  try {
    const res = await fetch('/api/workflows/aira-edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'EDIT_WORKFLOW',
        workflow,
        instruction: userInstruction,
      }),
    })

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}))
      throw new Error(
        errorData.errorMessage || `AI edit failed: ${res.statusText}`
      )
    }

    const data = await res.json()
    return {
      updatedWorkflow: data.updatedWorkflow || workflow,
      changes: data.changes || [],
      summary: (data.summary && data.summary.join(' ')) || 'Workflow updated',
    }
  } catch (error) {
    console.error('[workflowAIEditor] requestWorkflowEdit error:', error)
    throw error
  }
}

/**
 * Request step-level changes from AI
 * Sends current step + user description to Aivory endpoint
 * Returns updated step configuration
 */
export async function requestStepEdit(
  step: SavedWorkflow['steps'][0],
  userDescription: string,
  stepIndex: number,
  workflow?: SavedWorkflow
): Promise<StepEditResponse> {
  try {
    // If workflow not provided, create a minimal one for context
    const workflowContext = workflow || {
      workflow_id: 'unknown',
      title: 'Workflow',
      trigger: 'Manual',
      steps: [step],
      integrations: [],
    }

    const res = await fetch('/api/workflows/aira-edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'EDIT_STEP',
        workflow: workflowContext,
        targetStepId: String(stepIndex + 1),
        instruction: userDescription,
      }),
    })

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}))
      throw new Error(
        errorData.errorMessage || `Step AI edit failed: ${res.statusText}`
      )
    }

    const data = await res.json()
    const updatedSteps = data.updatedWorkflow?.steps || [step]
    const updatedStep = updatedSteps[stepIndex] || step

    return {
      updatedStep,
      changes: data.summary || [],
      explanation: (data.summary && data.summary.join(' ')) || 'Step updated',
    }
  } catch (error) {
    console.error('[workflowAIEditor] requestStepEdit error:', error)
    throw error
  }
}

/**
 * Generate human-readable change descriptions
 * Converts structured changes into plain language summaries
 */
export function generateChangeDescriptions(changes: WorkflowChange[]): string[] {
  return changes.map((change) => {
    switch (change.type) {
      case 'ADD_STEP':
        return `Add step: "${change.stepData?.action || 'New step'}"${
          change.stepIndex !== undefined ? ` after step ${change.stepIndex}` : ''
        }`
      case 'REMOVE_STEP':
        return `Remove step ${change.stepIndex !== undefined ? change.stepIndex + 1 : 'unknown'}`
      case 'UPDATE_STEP':
        return `Update step ${change.stepIndex !== undefined ? change.stepIndex + 1 : 'unknown'}: ${change.description}`
      case 'REORDER_STEPS':
        return `Reorder steps: ${change.description}`
      case 'UPDATE_TRIGGER':
        return `Update trigger: ${change.description}`
      default:
        return change.description
    }
  })
}

/**
 * Placeholder for workflow-to-ReactFlow conversion
 * Maps SavedWorkflow to React Flow nodes and edges
 * (Implementation depends on WorkflowCanvas structure)
 */
export function workflowToReactFlow(workflow: SavedWorkflow) {
  // This will be implemented based on WorkflowCanvas.tsx structure
  // For now, return a placeholder that the canvas can use
  return {
    nodes: [],
    edges: [],
  }
}

/**
 * Placeholder for ReactFlow-to-workflow conversion
 * Maps React Flow nodes and edges back to SavedWorkflow
 */
export function reactFlowToWorkflow(nodes: any[], edges: any[], previousWorkflow: SavedWorkflow) {
  // This will be implemented based on WorkflowCanvas.tsx structure
  return previousWorkflow
}

/**
 * Generate a natural language summary of the workflow
 * Used in AI editor to give context about current state
 */
export function generateWorkflowSummary(workflow: SavedWorkflow): string {
  const stepCount = workflow.steps.length
  const integrations = workflow.integrations.join(', ')

  let summary = `Current workflow: "${workflow.title}"\n`
  summary += `Trigger: ${workflow.trigger}\n`
  summary += `Steps: ${stepCount} step${stepCount !== 1 ? 's' : ''}\n`

  if (integrations) {
    summary += `Integrations: ${integrations}\n`
  }

  if (stepCount > 0) {
    summary += `\nSteps:\n`
    workflow.steps.forEach((step, i) => {
      summary += `${i + 1}. ${step.action}${step.tool ? ` (${step.tool})` : ''}\n`
    })
  }

  return summary
}

/**
 * Validate that a workflow has required configuration
 * Returns list of issues in plain language
 */
export function validateWorkflowConfig(workflow: SavedWorkflow): string[] {
  const issues: string[] = []

  if (!workflow.trigger || workflow.trigger.trim() === '') {
    issues.push('Trigger is not configured')
  }

  workflow.steps.forEach((step, i) => {
    if (!step.action || step.action.trim() === '') {
      issues.push(`Step ${i + 1} is missing a description`)
    }
  })

  return issues
}
