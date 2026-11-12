'use client'

/**
 * Workflow Copilot Client
 *
 * Single entry point: sendCopilotMessage()
 * The state machine on the server handles all routing internally —
 * the client just sends the message + the full current state and
 * gets back the updated state. No mode switching, no split paths.
 */

import { handleUpgradeRequired } from '@/lib/planAccess'
import { authedFetch } from '@/lib/deployAuth'
import type {
  CopilotConversationState,
  CopilotStage,
  GeneratedWorkflow,
  TestResult,
  Message,
} from '@/lib/workflows/copilotStateMachine'
import { asset } from '@/lib/asset'
import type { CanvasEditContext } from '@/lib/workflows/canvasCopilot'

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
  /** Set when the proposed workflow edits the workflow open on the canvas. */
  canvasTarget: { workflowId: string; title: string } | null
  // Full state — must be stored and sent back on the next request
  currentState: CopilotConversationState
}

export async function sendCopilotMessage(params: {
  prompt: string
  sessionId?: string | null
  currentState?: CopilotConversationState | null
  canvas?: CanvasEditContext | null
}): Promise<CopilotApiResponse> {
  const res = await authedFetch(asset('/api/workflows/copilot'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: params.prompt,
      sessionId: params.sessionId ?? undefined,
      currentState: params.currentState ?? undefined,
      canvas: params.canvas ?? undefined,
    }),
  })

  if (!res.ok) {
    let msg = 'Copilot request failed'
    try {
      const err = await res.json()
      msg = err.message || msg
      // Free session used up (or no plan): open the upgrade prompt too.
      handleUpgradeRequired(res.status, err, 'Workflow Copilot')
    } catch { /* ignore */ }
    throw new Error(msg)
  }

  return res.json() as Promise<CopilotApiResponse>
}