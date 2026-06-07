/**
 * Agentic Workflow Types
 *
 * Type definitions for the Manus-style agentic workflow UI.
 * These types model the streaming protocol extension, workflow state,
 * and all sub-structures (phases, sub-steps, file operations).
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
 */

// ---------------------------------------------------------------------------
// Sub-step icon type
// ---------------------------------------------------------------------------

export type SubStepIcon =
  | 'thinking'
  | 'editing'
  | 'searching'
  | 'generating'
  | 'terminal'
  | 'file'

// ---------------------------------------------------------------------------
// Core data models
// ---------------------------------------------------------------------------

export interface AgenticSubStep {
  id: string
  phaseId: string
  icon: SubStepIcon
  label: string
  duration?: number
}

export interface AgenticFileOp {
  id: string
  phaseId: string
  filename: string
  action: 'read' | 'written' | 'created'
}

export interface AgenticPhase {
  id: string
  title: string
  status: 'in_progress' | 'completed'
  subSteps: AgenticSubStep[]
  fileOps: AgenticFileOp[]
}

export interface AgenticWorkflowState {
  phases: AgenticPhase[]
  isComplete: boolean
  startedAt: number
}

// ---------------------------------------------------------------------------
// Agentic stream event types (protocol extension)
// ---------------------------------------------------------------------------

export type AgenticStreamEvent =
  | { type: 'agentic_start' }
  | { type: 'phase_start'; id: string; title: string }
  | { type: 'sub_step'; phaseId: string; id: string; icon: SubStepIcon; label: string }
  | { type: 'file_op'; phaseId: string; id: string; filename: string; action: 'read' | 'written' | 'created' }
  | { type: 'phase_end'; id: string }
  | { type: 'agentic_end' }

// ---------------------------------------------------------------------------
// Unified StreamEvent — existing events + agentic events
// ---------------------------------------------------------------------------

export type StreamEvent =
  | { type: 'chunk'; content: string }
  | { type: 'workflow_spec'; workflow: Record<string, unknown> }
  | { type: 'error'; error?: string }
  | { type: 'done' }
  | AgenticStreamEvent
