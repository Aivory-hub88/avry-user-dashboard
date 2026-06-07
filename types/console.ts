/**
 * Console-related TypeScript interfaces for VPS Bridge integration
 * 
 * These types define the structure for console streaming requests,
 * responses, and session management.
 */

/**
 * Represents a single message in the console conversation
 */
export interface ConsoleMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * Request payload for console streaming endpoint
 */
export interface ConsoleStreamRequest {
  session_id: string
  organization_id: string
  messages: ConsoleMessage[]
}

/**
 * Represents a chunk of data in the streaming response.
 * 
 * Event types:
 * - "chunk": text content token from the AI response
 * - "done": stream completed successfully
 * - "error": an error occurred
 * - "workflow_spec": AIRA detected a workflow intent and produced a structured
 *   workflow specification that can be sent to the Workflow canvas
 */
export interface StreamChunk {
  type: 'chunk' | 'done' | 'error' | 'workflow_spec'
  content?: string
  error?: string
  /** Set on synthetic 'done' events — true if at least one content chunk was received */
  receivedContent?: boolean
  /** Structured workflow spec payload — present when type === 'workflow_spec' */
  workflow?: WorkflowSpec
}

/**
 * Workflow specification produced by Aivory when user requests workflow generation.
 * Compatible with Aivory Workflow Spec used by the Workflow Tab / canvas.
 */
export interface WorkflowSpec {
  name: string
  description: string
  steps: Array<{
    id: string
    type: string
    appId: string
    actionId: string
    connectionId?: string
    inputs?: Record<string, unknown>
    position?: { x: number; y: number }
  }>
  edges?: Array<{ from: string; to: string }>
}

/**
 * Represents a complete console session with metadata
 */
export interface ConsoleSession {
  session_id: string
  organization_id: string
  messages: ConsoleMessage[]
  created_at: string
  last_activity: string
}
