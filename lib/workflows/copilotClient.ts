'use client'

/**
 * Workflow Copilot Client
 *
 * Single entry point: sendCopilotMessage()
 * The state machine on the server handles all routing internally —
 * the client just sends the message + the full current state and
 * gets back the updated state. No mode switching, no split paths.
 */

import type {
  CopilotConversationState,
  CopilotStage,
  GeneratedWorkflow,
  TestResult,
  Message,
} from '@/lib/workflows/copilotStateMachine'

// Re-export types so consumers don't need to import from the server file
export type { CopilotConversationState, CopilotStage, GeneratedWorkflow, TestResult, Message }

export interface CopilotApiResponse {
  sessionId: string
  message: string
  stage: CopilotStage
  workflow: GeneratedWorkflow | null
  testResults: TestResult[] | null
  testAttempts: number
  conversationHistory: Message[]
  // Convenience flags
  canApply: boolean
  isCompleted: boolean
  isTesting: boolean
  isError: boolean
  // Full state — must be stored and sent back on the next request
  currentState: CopilotConversationState
}

export async function sendCopilotMessage(params: {
  prompt: string
  sessionId?: string | null
  currentState?: CopilotConversationState | null
}): Promise<CopilotApiResponse> {
  const res = await fetch('/api/workflows/copilot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: params.prompt,
      sessionId: params.sessionId ?? undefined,
      currentState: params.currentState ?? undefined,
    }),
  })

  if (!res.ok) {
    let msg = 'Copilot request failed'
    try {
      const err = await res.json()
      msg = err.message || msg
    } catch { /* ignore */ }
    throw new Error(msg)
  }

  return res.json() as Promise<CopilotApiResponse>
}