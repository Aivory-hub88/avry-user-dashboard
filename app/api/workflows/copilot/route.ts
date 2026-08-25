/**
 * POST /api/workflows/copilot
 * Multi-turn agentic copilot — Clarify → Generate → Test → Fix → Explain → Apply
 *
 * STATE DESIGN: Stateless server. Full conversation state is owned by the client
 * and must be sent back as `currentState` on every request after the first.
 */
import { NextRequest } from 'next/server'
import {
  CopilotStateMachine,
  type CopilotConversationState,
} from '@/lib/workflows/copilotStateMachine'

export const maxDuration = 120

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // ------------------------------------------------------------------
    // BUG WAS HERE #1: old code read `prompt || description` and ignored
    // `currentState` entirely — so the state machine was always brand new
    // (IDLE stage) on every single request, wiping conversation history.
    // ------------------------------------------------------------------
    const { prompt, description, sessionId, currentState } = body

    // Accept both `prompt` (new) and `description` (legacy frontend field)
    const userInput = typeof prompt === 'string'
      ? prompt.trim()
      : typeof description === 'string'
        ? description.trim()
        : ''

    if (!userInput) {
      return Response.json(
        { error: true, message: 'prompt or description is required' },
        { status: 400 }
      )
    }

    const currentSessionId = sessionId || `session_${Date.now()}`
    console.log(
      `[copilot] session=${currentSessionId} stage=${(currentState as CopilotConversationState | undefined)?.stage ?? 'NEW'} prompt="${userInput.slice(0, 60)}"`
    )

    // ------------------------------------------------------------------
    // BUG WAS HERE #2: old code did `new CopilotStateMachine(sessionId)`
    // without restoring state — every request started fresh in IDLE, so
    // the machine ALWAYS fell into the generateWorkflow() path regardless
    // of what the user actually said or what stage they were in.
    //
    // FIX: reconstruct the machine from the client-supplied currentState.
    // On first message currentState is undefined → fresh machine (correct).
    // On follow-up messages currentState carries the full conversation →
    // machine resumes from wherever it left off (CLARIFYING, TESTING, etc.)
    // ------------------------------------------------------------------
    // Optional tenant attribution sent by the frontend (validated format).
    const ORG_PATTERN = /^[a-zA-Z0-9._-]{1,64}$/
    const rawOrg = (body as Record<string, unknown>).organization_id
    const organizationId =
      typeof rawOrg === 'string' && ORG_PATTERN.test(rawOrg) ? rawOrg : undefined

    const stateMachine = new CopilotStateMachine(
      currentSessionId,
      currentState as CopilotConversationState | undefined,
      organizationId
    )

    // ------------------------------------------------------------------
    // BUG WAS HERE #3: old code had a manual switch/case on a hand-rolled
    // intent detector with mismatched string literals ('GENERATE_WORKFLOW',
    // 'CONFIRM_YES', etc.) that no longer exist, and a `default` branch
    // that unconditionally called generateWorkflow() — so every message,
    // no matter what the user wrote, triggered a fresh workflow generation
    // instead of continuing the conversation.
    //
    // FIX: processMessage() owns all stage transitions internally.
    // The route just hands the message to the state machine and returns
    // whatever state comes out. No manual intent switching needed here.
    // ------------------------------------------------------------------
    let updatedState = await stateMachine.processMessage(userInput)

    // ------------------------------------------------------------------
    // ENTERPRISE FIX: the old runTests() recursed repair->test up to 3x
    // inside ONE request, which could exceed proxy/Next.js limits now that
    // generation is agentic. The machine defers each re-test via
    // pendingAutoAction and we drive it here within an explicit deadline.
    // If the budget runs out mid-repair, the flag stays set and the next
    // user message resumes testing seamlessly.
    // ------------------------------------------------------------------
    const AUTO_DRIVE_DEADLINE_MS = 95_000
    const autoDriveT0 = Date.now()
    while (
      updatedState.pendingAutoAction === 'run_tests' &&
      Date.now() - autoDriveT0 < AUTO_DRIVE_DEADLINE_MS
    ) {
      updatedState = await stateMachine.continuePending()
    }

    return Response.json({
      sessionId: currentSessionId,

      // Primary fields the UI needs
      message: updatedState.lastMessage,
      stage: updatedState.stage,
      workflow: updatedState.generatedWorkflow,
      testResults: updatedState.testResults,
      testAttempts: updatedState.testAttempts,
      conversationHistory: updatedState.conversationHistory,

      // Convenience booleans so the frontend doesn't have to inspect stage
      canApply: updatedState.stage === 'AWAITING_APPLY_APPROVAL',
      isCompleted: updatedState.stage === 'COMPLETED',
      isTesting: updatedState.stage === 'SANDBOX_TESTING' || updatedState.stage === 'FIXING',
      isError: updatedState.stage === 'ERROR',

      // Full state — client MUST store this and send it back as `currentState`
      // on the next request. This is what keeps the conversation alive.
      currentState: updatedState,
    })
  } catch (error) {
    console.error('[copilot] unhandled error:', error)
    return Response.json(
      { error: true, message: 'Failed to process copilot request' },
      { status: 500 }
    )
  }
}