/**
 * Copilot Conversation State Machine — Aivory
 * Full agentic loop: Clarify → Generate → Test → Fix → Apply
 *
 * Architecture:
 *   Browser (this file) → /api/copilot/* (Next.js proxy) → VPS Bridge → ZeroClaw / n8n
 *
 * PENTING: BridgeClient menggunakan URL relatif (/api/copilot/*)
 * sehingga TIDAK ada CORS — semua panggilan ke VPS Bridge terjadi
 * di sisi server (Next.js API route), bukan dari browser.
 *
 * Lihat: /app/api/copilot/[...path]/route.ts
 */

import { callCopilotOperation } from './bridgeCopilot'
import { analyzeRequest, matchTemplate, sanitizeWorkflow } from './deterministicPlanner'

// ============================================================
// TYPES
// ============================================================

export type CopilotStage =
  | 'IDLE'
  | 'CLARIFYING'
  | 'GENERATING'
  | 'SCHEMA_INSPECTION'
  | 'AWAITING_CONFIRMATION'
  | 'EDITING'
  | 'BUILDING_DRAFT'
  | 'SANDBOX_TESTING'
  | 'FIXING'
  | 'AWAITING_APPLY_APPROVAL'
  | 'APPLYING'
  | 'COMPLETED'
  | 'ERROR'

export interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export interface GeneratedWorkflowStep {
  id: string
  type: 'trigger' | 'action' | 'condition' | 'channel'
  title: string
  description?: string
  config?: Record<string, unknown>
  testable: boolean
  /** Resolved by n8n MCP inspection, written back after each sandbox test */
  nodeType?: string
  /**
   * Integration/service name (lowercase, e.g. "slack", "gmail") and its
   * operation. The bridge's draft service uses `app` as the definitive
   * signal when resolving steps to concrete n8n nodes — without it, node
   * matching falls back to fuzzy title-text search.
   */
  app?: string
  action?: string
}

export interface NodeConfig {
  stepId: string
  title: string
  configDetails: string
  requiredFields: {
    field: string
    value: string
    description: string
  }[]
}

export interface TestResult {
  stepId: string
  status: 'success' | 'error' | 'pending' | 'skipped'
  message: string
  inputData?: Record<string, unknown>
  outputData?: Record<string, unknown>
  errorDetail?: string | null
  timestamp: string
}

export interface WorkflowSetupReport {
  workflowId: string
  workflowName: string
  readyToDeploy: boolean
  nodeRequirements: {
    nodeId: string
    nodeName: string
    nodeType: string
    credentialType?: string
    requiredFields: {
      key: string
      label: string
      type: 'text' | 'password' | 'select' | 'oauth'
      example?: string
      options?: string[]
    }[]
  }[]
  summary: string
}

export interface WorkflowDummyTest {
  passed: boolean
  sandboxWorkflowId?: string
  validationMode?: string
  cleanupStatus?: string
  cleanupError?: string | null
  nodeResults?: {
    nodeId: string
    nodeName: string
    status: string
  }[]
  logs?: string[]
  errors?: {
    type?: string
    message: string
    node?: string
  }[]
}

export interface WorkflowInspectionReport {
  source: string
  available: boolean
  warnings?: string[]
  steps?: {
    stepId: string
    title: string
    selectedNodeType?: string | null
    selectedNode?: {
      nodeType?: string | null
      workflowNodeType?: string | null
      displayName?: string | null
      category?: string | null
    } | null
    validation?: {
      valid?: boolean
      errors?: unknown[]
      warnings?: unknown[]
    } | null
    error?: string
  }[]
}

export interface GeneratedWorkflow {
  workflowName: string
  steps: GeneratedWorkflowStep[]
  estimate_hours: number
  automation_score: number
  summary: string
  nodeConfigs: NodeConfig[]
  workflowId?: string
  draftArtifactPath?: string
  inspectionReport?: WorkflowInspectionReport
  dummyTest?: WorkflowDummyTest
  setupReport?: WorkflowSetupReport
}

export interface CopilotConversationState {
  sessionId: string
  stage: CopilotStage
  userRequest: string
  conversationHistory: Message[]
  generatedWorkflow: GeneratedWorkflow | null
  testResults: TestResult[] | null
  testAttempts: number
  userApprovals: {
    confirmedWorkflow: boolean
    approvedTest: boolean
    appliedToCanvas: boolean
  }
  lastMessage: string
  createdAt: string
  updatedAt: string
  /**
   * Number of clarify rounds already spent in this conversation. Optional for
   * backward compatibility with states persisted before this field existed.
   * The machine hard-caps clarification so a chatty LLM can never trap the
   * user in an endless question loop.
   */
  clarifyRounds?: number
}

// ============================================================
// BRIDGE RESPONSE SHAPES
// ============================================================

interface BridgeClarifyResponse {
  message: string
}

interface BridgeGenerateResponse {
  workflow: {
    workflowName: string
    steps: GeneratedWorkflowStep[]
    estimate_hours: number
    automation_score: number
    summary: string
  }
  message?: string
}

interface BridgeRepairResponse {
  workflow: {
    workflowName: string
    steps: GeneratedWorkflowStep[]
    estimate_hours?: number
    automation_score?: number
    summary?: string
  }
  message?: string
}

interface BridgeEditResponse {
  workflow: {
    workflowName: string
    steps: GeneratedWorkflowStep[]
    estimate_hours?: number
    automation_score?: number
    summary?: string
  }
  message?: string
}

interface BridgeDraftTestResponse {
  workflowId: string
  draftArtifactPath?: string
  inspectionReport?: WorkflowInspectionReport
  dummyTest: WorkflowDummyTest
  setupReport?: WorkflowSetupReport
}

// ============================================================
// HELPERS
// ============================================================

function buildNodeConfigsFromSetupReport(report?: WorkflowSetupReport): NodeConfig[] {
  if (!report?.nodeRequirements?.length) return []
  return report.nodeRequirements.map((node) => ({
    stepId: node.nodeId,
    title: node.nodeName,
    configDetails: `${node.nodeName} requires configuration before the workflow is activated.`,
    requiredFields: node.requiredFields.map((field) => ({
      field: field.label,
      value: field.example || (field.type === 'oauth' ? 'Connect account' : ''),
      description:
        field.type === 'oauth'
          ? `Connect account for ${node.nodeName}.`
          : `Fill in the ${field.label} field for ${node.nodeName}.`,
    })),
  }))
}

/**
 * Write MCP-resolved nodeTypes from inspectionReport back into workflow steps.
 * Dipanggil setelah setiap sandbox test agar retry berikutnya mengirim
 * node type konkret ke n8n-as-code, bukan teks judul bahasa Indonesia.
 */
function applyInspectedNodeTypes(
  steps: GeneratedWorkflowStep[],
  inspectionReport?: WorkflowInspectionReport,
): GeneratedWorkflowStep[] {
  if (!inspectionReport?.steps?.length) return steps

  const resolvedTypes = new Map<string, string>()
  for (const inspected of inspectionReport.steps) {
    const resolved =
      inspected.selectedNodeType ||
      inspected.selectedNode?.workflowNodeType ||
      inspected.selectedNode?.nodeType ||
      null
    if (resolved) resolvedTypes.set(inspected.stepId, resolved)
  }

  return steps.map((step) => {
    const resolved = resolvedTypes.get(step.id)
    return resolved && !step.nodeType ? { ...step, nodeType: resolved } : step
  })
}

function workflowStepToBridgeStep(step: GeneratedWorkflowStep) {
  return {
    id: step.id,
    type: step.type,
    title: step.title,
    description: step.description || '',
    config: step.config || {},
    // app/action are the draft service's primary node-resolution signal —
    // dropping them (as this mapper used to) forces fuzzy title matching.
    ...(step.app ? { app: step.app } : {}),
    ...(step.action ? { action: step.action } : {}),
    ...(step.nodeType ? { nodeType: step.nodeType } : {}),
  }
}

// ============================================================
// VPS BRIDGE CLIENT
// In-process calls into lib/workflows/bridgeCopilot.ts. The state machine
// only ever runs inside a Next.js API route (server-side), so there is no
// reason to loop back through the app's own PUBLIC URL to reach the bridge —
// the old self-fetch went container → Cloudflare → Traefik → same container,
// adding seconds of latency and an external dependency per message.
// ============================================================

class BridgeClient {
  private async call<T>(op: 'clarify' | 'generate' | 'repair' | 'edit' | 'draft-test', body: Record<string, unknown>): Promise<T> {
    const t0 = Date.now()
    try {
      const result = await callCopilotOperation(op, body)
      console.log('[BridgeClient]', op, { elapsedMs: Date.now() - t0 })
      return result as T
    } catch (error: unknown) {
      console.error('[BridgeClient] error', op, {
        elapsedMs: Date.now() - t0,
        cause: error instanceof Error ? error.message : String(error),
      })
      throw error instanceof Error ? error : new Error(String(error))
    }
  }

  async clarify(params: {
    session_id: string
    organization_id: string
    user_request: string
    conversation_history: Message[]
  }): Promise<BridgeClarifyResponse> {
    return this.call('clarify', params as unknown as Record<string, unknown>)
  }

  async generate(params: {
    session_id: string
    organization_id: string
    user_request: string
    conversation_history: Message[]
  }): Promise<BridgeGenerateResponse> {
    return this.call('generate', params as unknown as Record<string, unknown>)
  }

  async repair(params: {
    session_id: string
    organization_id: string
    user_request: string
    current_workflow: GeneratedWorkflow
    failed_steps: { stepId: string; error: string; inputData?: Record<string, unknown> }[]
  }): Promise<BridgeRepairResponse> {
    return this.call('repair', params as unknown as Record<string, unknown>)
  }

  async edit(params: {
    session_id: string
    organization_id: string
    user_request: string
    current_workflow: GeneratedWorkflow
    edit_request: string
  }): Promise<BridgeEditResponse> {
    return this.call('edit', params as unknown as Record<string, unknown>)
  }

  async draftTest(params: {
    organization_id: string
    workflowId?: string
    description: string
    steps: {
      id: string
      type: string
      title: string
      description: string
      config: Record<string, unknown>
      nodeType?: string
    }[]
  }): Promise<BridgeDraftTestResponse> {
    const result = await this.call<BridgeDraftTestResponse>(
      'draft-test',
      params as unknown as Record<string, unknown>,
    )
    if (!result.dummyTest) {
      throw new Error('VPS Bridge did not return sandbox test results.')
    }
    return result
  }
}


// ============================================================
// STATE MACHINE
// ============================================================

export class CopilotStateMachine {
  private state: CopilotConversationState
  private bridge: BridgeClient

  constructor(sessionId: string, initialState?: CopilotConversationState) {
    this.bridge = new BridgeClient()

    if (initialState) {
      this.state = initialState
    } else {
      this.state = {
        sessionId,
        stage: 'IDLE',
        userRequest: '',
        conversationHistory: [],
        generatedWorkflow: null,
        testResults: null,
        testAttempts: 0,
        userApprovals: {
          confirmedWorkflow: false,
          approvedTest: false,
          appliedToCanvas: false,
        },
        lastMessage: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    }
  }

  // ---- MAIN ENTRY POINT ----

  async processMessage(userMessage: string): Promise<CopilotConversationState> {
    this.addMessage('user', userMessage)

    switch (this.state.stage) {
      case 'IDLE':
        return this.handleIdle(userMessage)

      case 'CLARIFYING':
        return this.handleClarifying(userMessage)

      case 'AWAITING_CONFIRMATION':
        return this.handleConfirmation(userMessage)

      case 'EDITING':
        return this.handleEditing(userMessage)

      case 'AWAITING_APPLY_APPROVAL':
        return this.handleApplyApproval(userMessage)

      case 'ERROR':
        // Reset penuh dari error — mulai dari IDLE
        this.state.generatedWorkflow = null
        this.state.testResults = null
        this.state.testAttempts = 0
        this.state.userApprovals = {
          confirmedWorkflow: false,
          approvedTest: false,
          appliedToCanvas: false,
        }
        return this.handleIdle(userMessage)

      case 'COMPLETED':
        this.state.generatedWorkflow = null
        this.state.testResults = null
        this.state.testAttempts = 0
        this.state.userApprovals = {
          confirmedWorkflow: false,
          approvedTest: false,
          appliedToCanvas: false,
        }
        return this.handleIdle(userMessage)

      default:
        return this.state
    }
  }

  // ---- STAGE HANDLERS ----

  private async handleIdle(userMessage: string): Promise<CopilotConversationState> {
    this.state.userRequest = userMessage
    this.state.clarifyRounds = 0
    this.updateTimestamp()

    // ── Deterministic fast-paths — decide locally before spending any LLM
    // round trip. Both paths still land in AWAITING_CONFIRMATION, so the
    // user always reviews the result before anything is tested or applied.
    const analysis = analyzeRequest(userMessage)

    // 1) Template fast-path: a recognized pattern with both pipeline
    //    endpoints explicitly named builds instantly — zero LLM calls.
    const template = matchTemplate(userMessage, analysis)
    if (template) {
      console.log('[CopilotStateMachine] template fast-path', {
        session_id: this.state.sessionId,
        templateId: template.templateId,
      })
      this.state.generatedWorkflow = {
        workflowName: template.workflowName,
        steps: template.steps,
        estimate_hours: template.estimate_hours,
        automation_score: template.automation_score,
        summary: template.summary,
        nodeConfigs: [],
      }
      this.state.stage = 'AWAITING_CONFIRMATION'
      return this.setAssistantMessage(
        this.buildWorkflowSummaryMessage(template.steps, template.workflowName),
      )
    }

    // 2) Specific-request fast-path: trigger + source + target already named
    //    → generation has everything it needs; a clarify round would only
    //    ask for information the user already gave.
    if (analysis.isSpecific) {
      console.log('[CopilotStateMachine] skip-clarify fast-path', {
        session_id: this.state.sessionId,
        source: analysis.sourceApp?.id ?? null,
        target: analysis.targetApp?.id ?? null,
      })
      return this.generateWorkflow()
    }

    // ── Ambiguous request — one clarify round via LLM ──────────────────────
    this.state.stage = 'CLARIFYING'
    console.log('[CopilotStateMachine] entering CLARIFYING', {
      session_id:          this.state.sessionId,
      user_request_length: userMessage.length,
    })

    try {
      const result = await this.bridge.clarify({
        session_id: this.state.sessionId,
        organization_id: 'copilot',
        user_request: userMessage,
        conversation_history: this.state.conversationHistory,
      })

      this.state.clarifyRounds = 1
      // If the model skipped straight to emitting workflow JSON, don't show
      // it — generate properly instead.
      const clarifyMsg = chatSafeMessage(result.message)
      if (!clarifyMsg) return this.generateWorkflow()
      return this.setAssistantMessage(clarifyMsg)
    } catch (error: unknown) {
      console.error('[CopilotStateMachine] CLARIFYING error', {
        session_id: this.state.sessionId,
        cause:      error instanceof Error ? error.message : String(error),
      })
      return this.handleError(
        `Failed to process your request: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  private async handleClarifying(userMessage: string): Promise<CopilotConversationState> {
    const intent = detectUserIntent(userMessage)

    if (intent === 'cancel') {
      this.state.stage = 'IDLE'
      return this.setAssistantMessage('Okay, canceled. Is there anything else I can help you with?')
    }

    const rounds = this.state.clarifyRounds ?? 1

    // ── Deterministic exits before any LLM call ─────────────────────────────
    // 1) Hard cap: after 2 clarify rounds we generate with whatever we have.
    //    A chatty LLM must never be able to trap the user in a question loop.
    // 2) Combined-context specificity: if the original request PLUS this
    //    answer now name the full pipeline, generation has what it needs.
    const combinedContext = `${this.state.userRequest}\n${userMessage}`
    if (rounds >= 2 || analyzeRequest(combinedContext).isSpecific) {
      console.log('[CopilotStateMachine] clarify exit', {
        session_id: this.state.sessionId,
        reason: rounds >= 2 ? 'round-cap' : 'now-specific',
        rounds,
      })
      return this.generateWorkflow()
    }

    // ── One more clarify round via LLM ──────────────────────────────────────
    try {
      const result = await this.bridge.clarify({
        session_id: this.state.sessionId,
        organization_id: 'copilot',
        user_request: this.state.userRequest,
        conversation_history: this.state.conversationHistory,
      })

      const msg = chatSafeMessage(result.message) ?? ''
      // A response is "still clarifying" only if it actually asks something —
      // a question mark in the last two lines. The old keyword heuristic
      // ("what", "when", "please", "apa"...) matched nearly every sentence
      // and kept conversations stuck in CLARIFYING.
      const lastLines = msg.split('\n').filter(Boolean).slice(-2).join('\n')
      const isStillClarifying = lastLines.includes('?')

      if (isStillClarifying) {
        this.state.clarifyRounds = rounds + 1
        return this.setAssistantMessage(msg)
      }

      return this.generateWorkflow()
    } catch {
      // Fallback: just generate if clarify fails
      return this.generateWorkflow()
    }
  }

  async generateWorkflow(): Promise<CopilotConversationState> {
    this.state.stage = 'GENERATING'
    this.updateTimestamp()

    try {
      const result = await this.bridge.generate({
        session_id: this.state.sessionId,
        organization_id: 'copilot',
        user_request: this.state.userRequest,
        conversation_history: this.state.conversationHistory,
      })

      // Normalize: Zeroclaw may return { model, response } instead of { workflow }.
      // The API route normalizes this, but we guard here too for safety.
      let workflow = result?.workflow
      if (!workflow && result && (result as unknown as Record<string, unknown>).response) {
        const responseText = (result as unknown as Record<string, unknown>).response as string
        // Try to parse JSON from the response text first
        try {
          const parsed = JSON.parse(responseText)
          if (parsed && typeof parsed === 'object' && parsed.workflowName) {
            workflow = parsed
          }
        } catch {
          // Not JSON — create a minimal workflow from the response text
        }
        if (!workflow) {
          workflow = {
            workflowName: 'Generated Workflow',
            steps: [],
            estimate_hours: 2,
            automation_score: 0.8,
            summary: responseText,
          }
        }
      }

      // Guard: workflow must have a valid workflowName AND at least one step.
      // If we only got a placeholder (no steps), keep the user in a recoverable
      // state instead of transitioning to AWAITING_CONFIRMATION with an empty
      // workflow that would crash subsequent repair/edit calls.
      const hasValidWorkflow =
        workflow &&
        typeof workflow.workflowName === 'string' &&
        workflow.workflowName.trim().length > 0 &&
        Array.isArray(workflow.steps) &&
        workflow.steps.length > 0

      if (!hasValidWorkflow) {
        const fallbackMessage =
          chatSafeMessage(result?.message) ??
          ((workflow && typeof workflow.summary === 'string' && workflow.summary.trim())
            ? workflow.summary
            : 'Sorry, I cannot build a workflow from this request yet. Please explain more specifically — for example, the trigger, apps to use, and expected outcome.')

        this.state.stage = 'IDLE'
        this.state.generatedWorkflow = null
        return this.setAssistantMessage(fallbackMessage)
      }

      // Deterministic sanitation — normalize structural defects locally
      // (missing ids, wrong first-step type, unknown types) so they never
      // reach the sandbox, where each would cost a full repair round.
      const sanitized = sanitizeWorkflow(workflow.steps)
      if (sanitized.fixes.length > 0) {
        console.log('[CopilotStateMachine] sanitized LLM output', {
          session_id: this.state.sessionId,
          fixes: sanitized.fixes,
        })
      }

      this.state.generatedWorkflow = {
        workflowName: workflow.workflowName,
        steps: sanitized.steps,
        estimate_hours: workflow.estimate_hours ?? 2,
        automation_score: workflow.automation_score ?? 0.8,
        summary: workflow.summary ?? '',
        nodeConfigs: [],
      }

      this.state.stage = 'AWAITING_CONFIRMATION'

      // Always show the structured step-list summary. result.message is the
      // model's raw output on this path (often the workflow JSON itself) and
      // must never be surfaced verbatim in chat.
      const displayMessage = this.buildWorkflowSummaryMessage(
        this.state.generatedWorkflow.steps,
        this.state.generatedWorkflow.workflowName,
      )

      return this.setAssistantMessage(displayMessage)
    } catch (error: unknown) {
      console.error('[Copilot] generateWorkflow error:', error)
      return this.handleError(
        `Failed to create workflow: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  private async handleConfirmation(userMessage: string): Promise<CopilotConversationState> {
    const intent = detectUserIntent(userMessage)

    switch (intent) {
      case 'confirm': {
        this.state.userApprovals.confirmedWorkflow = true
        // Tampilkan pesan status sebelum testing dimulai
        const statusMsg =
          '🧪 Ready! I will perform a sandbox test of the workflow now...\n\n_(This might take a few seconds)_'
        this.state.lastMessage = statusMsg
        this.addMessage('assistant', statusMsg)
        this.updateTimestamp()
        return this.runTests(1)
      }

      case 'edit':
        this.state.stage = 'EDITING'
        return this.handleEditing(userMessage)

      case 'reject':
        this.state.stage = 'CLARIFYING'
        return this.setAssistantMessage(
          'Okay, tell me what is incorrect or needs to be changed in this workflow?',
        )

      case 'cancel':
        this.state.stage = 'IDLE'
        return this.setAssistantMessage('Workflow canceled. Is there anything else I can help you with?')

      default:
        this.state.stage = 'EDITING'
        return this.handleEditing(userMessage)
    }
  }

  async runTests(attempt: number): Promise<CopilotConversationState> {
    this.state.stage = 'SANDBOX_TESTING'
    this.state.testAttempts = attempt
    this.updateTimestamp()

    if (!this.state.generatedWorkflow) {
      return this.handleError('No workflow to test.')
    }

    try {
      const bridgeResult = await this.bridge.draftTest({
        organization_id: 'copilot',
        workflowId: this.state.generatedWorkflow.workflowId,
        description:
          this.state.generatedWorkflow.workflowName || this.state.userRequest,
        steps: this.state.generatedWorkflow.steps.map(workflowStepToBridgeStep),
      })

      // Simpan semua output bridge ke workflow
      this.state.generatedWorkflow.workflowId = bridgeResult.workflowId
      this.state.generatedWorkflow.draftArtifactPath = bridgeResult.draftArtifactPath
      this.state.generatedWorkflow.inspectionReport = bridgeResult.inspectionReport
      this.state.generatedWorkflow.dummyTest = bridgeResult.dummyTest
      this.state.generatedWorkflow.setupReport = bridgeResult.setupReport
      this.state.generatedWorkflow.nodeConfigs = buildNodeConfigsFromSetupReport(
        bridgeResult.setupReport,
      )

      // Tulis kembali nodeType yang sudah diresolvs MCP ke dalam steps
      this.state.generatedWorkflow.steps = applyInspectedNodeTypes(
        this.state.generatedWorkflow.steps,
        bridgeResult.inspectionReport,
      )

      // Bangun TestResult[] dari hasil sandbox
      const nodeResults = bridgeResult.dummyTest?.nodeResults || []
      const results: TestResult[] =
        nodeResults.length > 0
          ? nodeResults.map((node) => ({
              stepId: node.nodeId,
              status: (node.status === 'success' || node.status === 'structure_validated') ? 'success' : 'error',
              message:
                (node.status === 'success' || node.status === 'structure_validated')
                  ? `${node.nodeName} successfully tested in the sandbox.`
                  : `${node.nodeName} failed during sandbox testing.`,
              outputData: { validationMode: bridgeResult.dummyTest?.validationMode },
              errorDetail:
                (node.status === 'success' || node.status === 'structure_validated') ? null : node.status,
              timestamp: new Date().toISOString(),
            }))
          : this.state.generatedWorkflow.steps.map((step) => ({
              stepId: step.id,
              status: bridgeResult.dummyTest?.passed ? 'success' : 'error',
              message: bridgeResult.dummyTest?.passed
                ? `${step.title} successfully validated in the sandbox.`
                : `${step.title} failed sandbox validation.`,
              outputData: { validationMode: bridgeResult.dummyTest?.validationMode },
              errorDetail:
                bridgeResult.dummyTest?.errors?.map((e) => e.message).join('; ') || null,
              timestamp: new Date().toISOString(),
            }))

      this.state.testResults = results
      const failedSteps = results.filter((r) => r.status === 'error')

      if (failedSteps.length === 0) {
        this.state.stage = 'AWAITING_APPLY_APPROVAL'
        return this.setAssistantMessage(this.buildApprovalMessage(attempt))
      }

      if (attempt < 3) {
        this.state.stage = 'FIXING'
        const failureList = failedSteps
          .map((f) => `• **${f.stepId}**: ${f.errorDetail || f.message}`)
          .join('\n')

        // First failure: try a deterministic local repair before spending an
        // LLM round. Sanitation + the MCP-resolved nodeTypes (already written
        // back above) fix the common structural failures. Only when the local
        // pass has nothing to change do we escalate to the LLM immediately.
        if (attempt === 1 && this.state.generatedWorkflow) {
          const local = sanitizeWorkflow(this.state.generatedWorkflow.steps)
          const gainedNodeTypes = this.state.generatedWorkflow.steps.some(
            (s, i) => s.nodeType && !local.steps[i]?.nodeType,
          )
          if (local.fixes.length > 0 || gainedNodeTypes) {
            console.log('[CopilotStateMachine] local repair', {
              session_id: this.state.sessionId,
              fixes: local.fixes,
            })
            this.state.generatedWorkflow.steps = local.steps.map((s, i) => {
              const prev = this.state.generatedWorkflow!.steps[i]
              return prev?.nodeType && !s.nodeType ? { ...s, nodeType: prev.nodeType } : s
            })
            this.setAssistantMessage(
              `⚠️ ${failedSteps.length} steps failed during testing (attempt ${attempt}/3):\n${failureList}\n\n🔧 Applying automatic structural fixes and retesting...`,
            )
            return this.runTests(attempt + 1)
          }
        }

        this.setAssistantMessage(
          `⚠️ ${failedSteps.length} steps failed during testing (attempt ${attempt}/3):\n${failureList}\n\n🔧 Automatically repairing...`,
        )
        await this.repairWorkflow(failedSteps)
        return this.runTests(attempt + 1)
      }

      const errorSummary = failedSteps
        .map((f) => `• **${f.stepId}**: ${f.errorDetail || f.message}`)
        .join('\n')
      return this.handleError(
        `Workflow failed after ${attempt} automatic repair attempts.\n\nRemaining errors:\n${errorSummary}\n\nPlease provide additional technical details so I can help fix this manually.`,
      )
    } catch (error: unknown) {
      console.error('[Copilot] runTests error:', error)
      const message =
        error instanceof Error ? error.message : 'An error occurred during testing.'
      return this.handleError(`An error occurred during sandbox testing: ${message}`)
    }
  }

  /**
   * Delegasikan repair ke ZeroClaw via Bridge.
   * Re-inject nodeTypes yang sudah diresolvs setelah ZeroClaw menulis ulang steps.
   */
  private async repairWorkflow(failedSteps: TestResult[]): Promise<void> {
    if (!this.state.generatedWorkflow) return

    // Snapshot nodeTypes sebelum ZeroClaw menulis ulang steps
    const existingNodeTypes = new Map<string, string>()
    for (const step of this.state.generatedWorkflow.steps) {
      if (step.nodeType) existingNodeTypes.set(step.id, step.nodeType)
    }

    try {
      const result = await this.bridge.repair({
        session_id: this.state.sessionId,
        organization_id: 'copilot',
        user_request: this.state.userRequest,
        current_workflow: this.state.generatedWorkflow,
        failed_steps: failedSteps.map((f) => ({
          stepId: f.stepId,
          error: f.errorDetail || f.message,
          inputData: f.inputData,
        })),
      })

      // Re-inject MCP-resolved nodeTypes yang tidak dibawa ZeroClaw.
      // Guard: kalau ZeroClaw tidak return workflow valid (steps kosong atau
      // workflowName missing), pertahankan workflow saat ini supaya repair
      // loop tidak menghapus steps yang sudah ada.
      const repairedWorkflow = result?.workflow
      const repairedStepsValid =
        repairedWorkflow && Array.isArray(repairedWorkflow.steps) && repairedWorkflow.steps.length > 0

      if (!repairedStepsValid) {
        console.warn('[Copilot] repairWorkflow: ZeroClaw returned invalid workflow, keeping current steps')
        return
      }

      this.state.generatedWorkflow.steps = sanitizeWorkflow(repairedWorkflow.steps).steps.map((step) => {
        const known = existingNodeTypes.get(step.id)
        return known && !step.nodeType ? { ...step, nodeType: known } : step
      })

      if (typeof repairedWorkflow.workflowName === 'string' && repairedWorkflow.workflowName.trim()) {
        this.state.generatedWorkflow.workflowName = repairedWorkflow.workflowName
      }
      if (typeof repairedWorkflow.summary === 'string') {
        this.state.generatedWorkflow.summary = repairedWorkflow.summary
      }
    } catch (error: unknown) {
      // Jangan crash retry loop — runTests berikutnya pakai steps saat ini
      console.error('[Copilot] repairWorkflow error:', error)
    }
  }

  private async handleEditing(userMessage: string): Promise<CopilotConversationState> {
    if (!this.state.generatedWorkflow) {
      return this.generateWorkflow()
    }

    try {
      const result = await this.bridge.edit({
        session_id: this.state.sessionId,
        organization_id: 'copilot',
        user_request: this.state.userRequest,
        current_workflow: this.state.generatedWorkflow,
        edit_request: userMessage,
      })

      // Guard: only accept edit result if it has valid steps
      const editedWorkflow = result?.workflow
      const editedStepsValid =
        editedWorkflow && Array.isArray(editedWorkflow.steps) && editedWorkflow.steps.length > 0

      if (!editedStepsValid) {
        console.warn('[Copilot] handleEditing: ZeroClaw returned invalid workflow, keeping current state')
        const message =
          chatSafeMessage(result?.message) ??
          'I cannot process that change yet. Please explain the step you want to change in more detail.'
        return this.setAssistantMessage(message)
      }

      this.state.generatedWorkflow.steps = sanitizeWorkflow(editedWorkflow.steps).steps
      if (typeof editedWorkflow.workflowName === 'string' && editedWorkflow.workflowName.trim()) {
        this.state.generatedWorkflow.workflowName = editedWorkflow.workflowName
      }
      if (typeof editedWorkflow.summary === 'string') {
        this.state.generatedWorkflow.summary = editedWorkflow.summary
      }

      // Reset test state — workflow berubah
      this.state.testResults = null
      this.state.testAttempts = 0
      this.state.stage = 'AWAITING_CONFIRMATION'

      // Same as generate: never surface result.message (raw model JSON) —
      // show the structured "workflow updated" step list instead.
      const displayMessage = this.buildWorkflowSummaryMessage(
        this.state.generatedWorkflow.steps,
        this.state.generatedWorkflow.workflowName,
        true,
      )

      return this.setAssistantMessage(displayMessage)
    } catch (error: unknown) {
      console.error('[Copilot] handleEditing error:', error)
      return this.handleError(
        'Failed to edit the workflow. Please explain the desired changes.',
      )
    }
  }

  private async handleApplyApproval(userMessage: string): Promise<CopilotConversationState> {
    const intent = detectUserIntent(userMessage)

    if (intent === 'confirm' || intent === 'apply') {
      this.state.userApprovals.approvedTest = true
      this.state.stage = 'AWAITING_APPLY_APPROVAL'
      return this.setAssistantMessage(
        `The workflow has passed the sandbox test. Click the **Apply to canvas** button to place the workflow "${this.state.generatedWorkflow?.workflowName}" onto the canvas.`,
      )
    }

    if (intent === 'edit') {
      this.state.stage = 'EDITING'
      return this.handleEditing(userMessage)
    }

    if (intent === 'reject' || intent === 'cancel') {
      this.state.stage = 'IDLE'
      return this.setAssistantMessage(
        'Okay, the workflow was not applied. It is saved as a draft. Is there anything else I can help you with?',
      )
    }

    return this.setAssistantMessage(
      'Do you want to apply this workflow to the canvas? Reply **yes** to apply or **no** to cancel.',
    )
  }

  // ---- MESSAGE BUILDERS ----

  private buildWorkflowSummaryMessage(
    steps: GeneratedWorkflowStep[],
    workflowName: string,
    isEdit = false,
  ): string {
    const stepList = steps
      .map((s, i) => `${i + 1}. **${s.title}** (${s.type}) — ${s.description}`)
      .join('\n')
    const summary = this.state.generatedWorkflow?.summary
      ? `\n\n📝 *${this.state.generatedWorkflow.summary}*`
      : ''

    if (isEdit) {
      return (
        `✏️ Workflow has been updated!\n\n${stepList}${summary}\n\n` +
        `Does it look good now? Reply **yes** to continue testing.`
      )
    }

    return (
      `✅ I have created the workflow **"${workflowName}"** with ${steps.length} steps:\n\n` +
      `${stepList}${summary}\n\n` +
      `Does this meet your needs? Reply **yes** to continue testing, ` +
      `**edit** to change it, or explain what needs to be fixed.`
    )
  }

  private buildApprovalMessage(attempts: number): string {
    const wf = this.state.generatedWorkflow
    const results = this.state.testResults
    if (!wf || !results) return ''

    const passed = results.filter((r) => r.status === 'success').length
    const skipped = results.filter((r) => r.status === 'skipped').length
    const total = results.length
    const attemptNote =
      attempts > 1 ? `_(Succeeded after ${attempts} automatic repairs)_\n\n` : ''

    const testSummary = results
      .map((r) => {
        const icon =
          r.status === 'success' ? '✅' : r.status === 'skipped' ? '⏭️' : '❌'
        return `${icon} **${r.stepId}**: ${r.message}`
      })
      .join('\n')

    let nodeDetails = ''
    if (wf.nodeConfigs.length > 0) {
      nodeDetails =
        '\n\n---\n📋 **Detailed Node Configuration:**\n\n' +
        wf.nodeConfigs
          .map((nc, i) => {
            const fields = nc.requiredFields
              .map(
                (f) =>
                  `   • **${f.field}**: \`${f.value}\`\n     _${f.description}_`,
              )
              .join('\n')
            return `**${i + 1}. ${nc.title}**\n${nc.configDetails}\n${fields}`
          })
          .join('\n\n')
    }

    return (
      `✅ **Sandbox testing complete! ${passed} succeeded, ${skipped} skipped, out of ${total} total steps.**\n_Validation: ${wf.dummyTest?.validationMode || 'sandbox'}_\n\n` +
      attemptNote +
      `${testSummary}\n\n` +
      `---\n📌 **Workflow Summary:**\n${wf.summary}` +
      nodeDetails +
      `\n\n---\n🚀 **The workflow "${wf.workflowName}" is ready to be applied. Click the Apply to canvas button to place it onto the canvas.**`
    )
  }

  // ---- STATE UTILS ----

  private addMessage(role: 'user' | 'assistant', content: string) {
    this.state.conversationHistory.push({
      role,
      content,
      timestamp: new Date().toISOString(),
    })
  }

  private setAssistantMessage(message: string): CopilotConversationState {
    this.state.lastMessage = message
    this.addMessage('assistant', message)
    this.updateTimestamp()
    return this.state
  }

  private handleError(message: string): CopilotConversationState {
    this.state.stage = 'ERROR'
    return this.setAssistantMessage(`❌ ${message}`)
  }

  private updateTimestamp() {
    this.state.updatedAt = new Date().toISOString()
  }

  getState(): CopilotConversationState {
    return { ...this.state }
  }
}

// ============================================================
// MESSAGE SAFETY
// ============================================================

/**
 * Bridge/Zeroclaw responses on workflow_* entrypoints are often the raw
 * workflow JSON (the bridge instructs "output ONLY a single JSON object").
 * A chat bubble must never show that payload — accept a bridge message only
 * when it reads like prose.
 */
export function chatSafeMessage(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.startsWith('```')) return null
  return trimmed
}

// ============================================================
// INTENT DETECTION
// ============================================================

export function detectUserIntent(
  message: string,
): 'confirm' | 'reject' | 'edit' | 'test' | 'apply' | 'cancel' | 'unknown' {
  const lower = message.toLowerCase().trim()

  if (
    /^(ya|yes|ok|oke|lanjut|proceed|benar|betul|iya|setuju|confirm|yep|yap|gas|siap|boleh)$/i.test(
      lower,
    )
  )
    return 'confirm'

  // "Publish it", "publikasikan", "go live" — treat as confirmation so the
  // flow proceeds to sandbox testing instead of falling through to EDIT
  // (which echoes the whole workflow back through the LLM).
  if (/\b(publish|publikasikan|terbitkan|go.?live)\b/i.test(lower)) return 'confirm'

  if (
    /^(tidak|no|nope|gak|engga|batal|cancel|ndak|nggak|jangan|stop)$/i.test(lower)
  )
    return 'reject'

  if (
    /edit|ubah|ganti|tambah|hapus|update|modify|change|add|remove|kurang|lebih|revisi|perbaiki/i.test(
      lower,
    )
  )
    return 'edit'

  if (/test|coba|try|check|verify|uji|jalankan/i.test(lower)) return 'test'

  if (/apply|terapkan|gunakan|aktifkan|deploy|pasang|pakai/i.test(lower))
    return 'apply'

  if (/cancel|batal|batalkan|keluar|reset/i.test(lower)) return 'cancel'

  return 'unknown'
}