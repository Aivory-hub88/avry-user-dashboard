/**
 * Workflow Copilot Client
 * Two functions for the two AIRA copilot modes:
 *   askAiraChat()      → chat / expert mode (natural language answer)
 *   generateWorkflow() → workflow builder mode (structured JSON spec)
 *
 * Both call POST /api/workflows/copilot with the appropriate mode field.
 */

export type GeneratedWorkflowStep = {
  id: string
  type: 'trigger' | 'action' | 'condition' | 'channel'
  title: string
  description?: string
}

export type GeneratedWorkflow = {
  steps: GeneratedWorkflowStep[]
  estimate_hours?: number | null
  automation_score?: number | null
}

export type ChatResponse = {
  content: string
}

async function callCopilot(body: Record<string, unknown>): Promise<Response> {
  return fetch('/api/workflows/copilot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/**
 * Chat / expert mode — returns a natural language answer.
 */
export async function askAiraChat(params: {
  message: string
  workflowContext?: Record<string, unknown>
}): Promise<ChatResponse> {
  const res = await callCopilot({
    mode: 'chat',
    description: params.message,
    workflowContext: params.workflowContext,
  })

  if (!res.ok) {
    let msg = 'Chat request failed'
    try { const err = await res.json(); msg = err.message || msg } catch { /* ignore */ }
    throw new Error(msg)
  }

  const data = await res.json()
  return { content: data.content ?? '' }
}

/**
 * Workflow builder mode — returns structured workflow steps.
 */
export async function generateWorkflow(params: {
  description: string
  workflowContext?: Record<string, unknown>
}): Promise<GeneratedWorkflow> {
  const res = await callCopilot({
    mode: 'workflow',
    description: params.description,
    workflowContext: params.workflowContext,
  })

  if (!res.ok) {
    let msg = 'Failed to generate workflow'
    try { const err = await res.json(); msg = err.message || msg } catch { /* ignore */ }
    throw new Error(msg)
  }

  return res.json() as Promise<GeneratedWorkflow>
}
