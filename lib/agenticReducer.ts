/**
 * Agentic Workflow Reducer
 *
 * Pure function that processes StreamEvents and returns immutable
 * AgenticWorkflowState transitions. Handles all agentic event types,
 * guard clauses for malformed/orphaned events, and auto-complete logic.
 *
 * Requirements: 1.1–1.7, 2.1–2.5, 8.1–8.4
 */

import type {
  AgenticWorkflowState,
  StreamEvent,
} from '@/types/agenticWorkflow'

/**
 * Pure reducer for agentic workflow state.
 *
 * Returns a new state object for every state-changing event (immutable).
 * Non-agentic events (chunk, done, error, workflow_spec) return state unchanged,
 * except `done` which triggers auto-complete if agentic_end was never received.
 */
export function agenticReducer(
  state: AgenticWorkflowState | null,
  event: StreamEvent
): AgenticWorkflowState | null {
  switch (event.type) {
    case 'agentic_start':
      return { phases: [], isComplete: false, startedAt: Date.now() }

    case 'phase_start': {
      if (!state) return state
      // Guard: skip malformed events missing id or title
      if (!event.id || !event.title) return state
      // Guard: skip duplicate phase IDs
      if (state.phases.some((p) => p.id === event.id)) return state
      return {
        ...state,
        phases: [
          ...state.phases,
          {
            id: event.id,
            title: event.title,
            status: 'in_progress',
            subSteps: [],
            fileOps: [],
          },
        ],
      }
    }

    case 'sub_step': {
      if (!state) return state
      // Guard: skip orphaned sub_step (phaseId doesn't exist)
      if (!state.phases.some((p) => p.id === event.phaseId)) return state
      return {
        ...state,
        phases: state.phases.map((p) =>
          p.id === event.phaseId
            ? {
                ...p,
                subSteps: [
                  ...p.subSteps,
                  {
                    id: event.id,
                    phaseId: event.phaseId,
                    icon: event.icon,
                    label: event.label,
                  },
                ],
              }
            : p
        ),
      }
    }

    case 'file_op': {
      if (!state) return state
      // Guard: skip orphaned file_op (phaseId doesn't exist)
      if (!state.phases.some((p) => p.id === event.phaseId)) return state
      return {
        ...state,
        phases: state.phases.map((p) =>
          p.id === event.phaseId
            ? {
                ...p,
                fileOps: [
                  ...p.fileOps,
                  {
                    id: event.id,
                    phaseId: event.phaseId,
                    filename: event.filename,
                    action: event.action,
                  },
                ],
              }
            : p
        ),
      }
    }

    case 'phase_end': {
      if (!state) return state
      return {
        ...state,
        phases: state.phases.map((p) =>
          p.id === event.id ? { ...p, status: 'completed' as const } : p
        ),
      }
    }

    case 'agentic_end': {
      if (!state) return state
      return { ...state, isComplete: true }
    }

    case 'done': {
      // Auto-complete: if agentic state exists but agentic_end was never received
      if (!state || state.isComplete) return state
      return {
        ...state,
        isComplete: true,
        phases: state.phases.map((p) =>
          p.status === 'in_progress'
            ? { ...p, status: 'completed' as const }
            : p
        ),
      }
    }

    default:
      // Non-agentic events (chunk, error, workflow_spec) — return unchanged
      return state
  }
}

/**
 * Returns true if the given array of events contains at least one
 * `agentic_start` event, indicating an agentic workflow response.
 */
export function isAgenticResponse(events: StreamEvent[]): boolean {
  return events.some((e) => e.type === 'agentic_start')
}
