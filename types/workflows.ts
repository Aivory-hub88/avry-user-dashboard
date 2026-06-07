/**
 * Workflow Specification Types
 * 
 * This module defines the core TypeScript interfaces for the Aivory Workflow Generation system.
 * All workflow specifications, steps, edges, and related types are defined here to ensure
 * consistency across backend and frontend surfaces.
 * 
 * @module types/workflows
 */

/**
 * Classification of a workflow step
 * 
 * - 'trigger': Initial step that starts workflow execution (required, one per workflow)
 * - 'action': Step that performs an operation in an external app
 * - 'ai': Step that uses AI to process or transform data
 * - 'filter': Step that conditionally routes workflow execution
 * - 'agent': Step that runs an AI agent
 */
export type WorkflowStepType = 'trigger' | 'action' | 'ai' | 'filter' | 'agent'

/**
 * Individual unit in a workflow with configuration and positioning
 * 
 * @interface WorkflowStep
 * @property {string} id - Unique identifier for the step (e.g., "step_1")
 * @property {WorkflowStepType} type - Classification of the step
 * @property {string} appId - App identifier (e.g., "slack", "gmail")
 * @property {string} actionId - Action within the app (e.g., "send_message")
 * @property {string} connectionId - Connection instance ID for the app
 * @property {Record<string, any>} inputs - Step configuration (app-specific key-value pairs)
 * @property {Object} position - Canvas positioning coordinates
 * @property {number} position.x - Canvas X coordinate
 * @property {number} position.y - Canvas Y coordinate
 * @property {string} [agentId] - Optional agent ID for type: 'agent' nodes
 * @property {string} [agentName] - Optional agent name (cached for display)
 */
export interface WorkflowStep {
  id: string
  type: WorkflowStepType
  appId: string
  actionId: string
  connectionId: string
  inputs: Record<string, any>
  position: {
    x: number
    y: number
  }
  agentId?: string
  agentName?: string
}

/**
 * Connection between two workflow steps defining data flow
 * 
 * @interface AivoryWorkflowEdge
 * @property {string} from - Source step ID
 * @property {string} to - Target step ID
 * @property {string} [label] - Optional label for the edge (e.g., "if true", "if false")
 */
export interface AivoryWorkflowEdge {
  from: string
  to: string
  label?: string
}

/**
 * Complete workflow specification containing all steps and metadata
 * 
 * @interface AivoryWorkflowSpec
 * @property {string} name - Workflow title
 * @property {string} description - Human-readable description of what the workflow does
 * @property {string} source - Origin of the workflow ("console" | "workflow-tab" | "copilot")
 * @property {string} intent - Original user description or request
 * @property {WorkflowStep[]} steps - All workflow steps in execution order
 */
export interface AivoryWorkflowSpec {
  name: string
  description: string
  source: string
  intent: string
  steps: WorkflowStep[]
}

/**
 * Result of workflow generation containing spec, edges, and metadata
 * 
 * @interface WorkflowGenerationResult
 * @property {AivoryWorkflowSpec} spec - The generated workflow specification
 * @property {AivoryWorkflowEdge[]} edges - Connections between workflow steps
 * @property {Object} notes - Metadata about the generation
 * @property {string} notes.summary - What the workflow does
 * @property {string[]} notes.assumptions - Assumptions made during generation
 * @property {string[]} notes.warnings - Non-blocking issues or warnings
 */
export interface WorkflowGenerationResult {
  spec: AivoryWorkflowSpec
  edges: AivoryWorkflowEdge[]
  notes: {
    summary: string
    assumptions: string[]
    warnings: string[]
  }
}

/**
 * Result of copilot operations (refine or explain)
 * 
 * @interface CopilotResult
 * @property {AivoryWorkflowSpec} spec - The workflow specification (modified for refine mode)
 * @property {AivoryWorkflowEdge[]} edges - Connections between workflow steps
 * @property {Object} [changes] - Summary of changes made (only for refine mode)
 * @property {string[]} [changes.added] - Step IDs that were added
 * @property {string[]} [changes.modified] - Step IDs that were modified
 * @property {string[]} [changes.removed] - Step IDs that were removed
 * @property {string} [explanation] - Human-readable explanation (only for explain mode)
 */
export interface CopilotResult {
  spec: AivoryWorkflowSpec
  edges: AivoryWorkflowEdge[]
  changes?: {
    added: string[]
    modified: string[]
    removed: string[]
  }
  explanation?: string
}
