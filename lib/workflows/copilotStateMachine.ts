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
    configDetails: `${node.nodeName} membutuhkan konfigurasi sebelum workflow diaktifkan.`,
    requiredFields: node.requiredFields.map((field) => ({
      field: field.label,
      value: field.example || (field.type === 'oauth' ? 'Connect account' : ''),
      description:
        field.type === 'oauth'
          ? `Hubungkan akun untuk ${node.nodeName}.`
          : `Isi field ${field.label} untuk ${node.nodeName}.`,
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
    ...(step.nodeType ? { nodeType: step.nodeType } : {}),
  }
}

// ============================================================
// VPS BRIDGE CLIENT
// ✅ FIXED: Menggunakan URL relatif /api/copilot/* → tidak ada CORS
// Server-side proxy di /app/api/copilot/[...path]/route.ts
// ============================================================

class BridgeClient {
  /**
   * Semua request ke VPS Bridge diproxy melalui Next.js API route.
   * Browser: fetch('/api/copilot/workflows/clarify') → server → VPS Bridge
   */
  private async post<T>(path: string, body: unknown): Promise<T> {
    const isServer = typeof window === 'undefined'
    const url = isServer
      ? `${(process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(/\/$/, '')}/api/copilot${path}`
      : `/api/copilot${path}`

    const bodyRecord = body && typeof body === 'object' ? body as Record<string, unknown> : {}
    console.log('[BridgeClient] →', path, {
      url,
      session_id:      bodyRecord.session_id ?? null,
      organization_id: bodyRecord.organization_id ?? null,
    })

    const t0 = Date.now()

    // Explicit 120s timeout with AbortController for proper cancellation.
    // This matches the maxDuration on the copilot route and the VPS Bridge
    // timeout, preventing silent hangs at any hop in the chain.
    const controller = new AbortController()
    const timeoutId  = setTimeout(() => controller.abort(), 120_000)

    let response: Response
    try {
      response = await fetch(url, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body:    JSON.stringify(body),
        signal:  controller.signal,
      })
    } finally {
      clearTimeout(timeoutId)
    }

    const elapsed = Date.now() - t0
    console.log('[BridgeClient] ←', path, {
      status:    response.status,
      ok:        response.ok,
      elapsedMs: elapsed,
    })

    const rawBody = await response.text()
    let parsed: unknown = null
    try {
      parsed = rawBody ? JSON.parse(rawBody) : null
    } catch {
      parsed = null
    }

    if (!response.ok) {
      const msg =
        parsed && typeof (parsed as Record<string, unknown>).message === 'string'
          ? (parsed as Record<string, unknown>).message as string
          : rawBody || `Error ${response.status}`
      console.error('[BridgeClient] error', path, { status: response.status, msg, elapsedMs: elapsed })
      throw new Error(msg)
    }

    return parsed as T
  }

  async clarify(params: {
    session_id: string
    organization_id: string
    user_request: string
    conversation_history: Message[]
  }): Promise<BridgeClarifyResponse> {
    return this.post('/workflows/clarify', params)
  }

  async generate(params: {
    session_id: string
    organization_id: string
    user_request: string
    conversation_history: Message[]
  }): Promise<BridgeGenerateResponse> {
    return this.post('/workflows/generate', params)
  }

  async repair(params: {
    session_id: string
    organization_id: string
    user_request: string
    current_workflow: GeneratedWorkflow
    failed_steps: { stepId: string; error: string; inputData?: Record<string, unknown> }[]
  }): Promise<BridgeRepairResponse> {
    return this.post('/workflows/repair', params)
  }

  async edit(params: {
    session_id: string
    organization_id: string
    user_request: string
    current_workflow: GeneratedWorkflow
    edit_request: string
  }): Promise<BridgeEditResponse> {
    return this.post('/workflows/edit', params)
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
    const result = await this.post<BridgeDraftTestResponse>(
      '/workflows/draft-test',
      params,
    )
    if (!result.dummyTest) {
      throw new Error('VPS Bridge tidak mengembalikan hasil sandbox test.')
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
    this.state.stage = 'CLARIFYING'
    this.updateTimestamp()

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

      console.log('[CopilotStateMachine] CLARIFYING done', {
        session_id:      this.state.sessionId,
        message_length:  result.message?.length ?? 0,
      })

      return this.setAssistantMessage(result.message)
    } catch (error: unknown) {
      console.error('[CopilotStateMachine] CLARIFYING error', {
        session_id: this.state.sessionId,
        cause:      error instanceof Error ? error.message : String(error),
      })
      return this.handleError(
        `Gagal memproses permintaan Anda: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  private async handleClarifying(userMessage: string): Promise<CopilotConversationState> {
    const intent = detectUserIntent(userMessage)

    if (intent === 'cancel') {
      this.state.stage = 'IDLE'
      return this.setAssistantMessage('Baik, dibatalkan. Ada yang bisa saya bantu?')
    }

    // Multi-turn clarification: call clarify again with updated history.
    // If Zeroclaw still has a question → stay in CLARIFYING.
    // If the response looks ready → proceed to generate.
    try {
      const result = await this.bridge.clarify({
        session_id: this.state.sessionId,
        organization_id: 'copilot',
        user_request: this.state.userRequest,
        conversation_history: this.state.conversationHistory,
      })

      const msg = result.message ?? ''
      const isStillClarifying =
        msg.trim().endsWith('?') ||
        msg.toLowerCase().includes('tolong') ||
        msg.toLowerCase().includes('bisa ceritakan') ||
        msg.toLowerCase().includes('konfirmasi') ||
        msg.toLowerCase().includes('berapa') ||
        msg.toLowerCase().includes('kapan') ||
        msg.toLowerCase().includes('apa')

      if (isStillClarifying) {
        // Stay in CLARIFYING — Zeroclaw still needs more info
        return this.setAssistantMessage(msg)
      }

      // Zeroclaw is satisfied — proceed to generate
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
          typeof result?.message === 'string' && result.message.trim()
            ? result.message
            : (workflow && typeof workflow.summary === 'string' && workflow.summary.trim())
              ? workflow.summary
              : 'Maaf, saya belum bisa menyusun workflow dari permintaan ini. Coba jelaskan lebih spesifik — misalnya trigger, apps yang dipakai, dan hasil yang diharapkan.'

        this.state.stage = 'IDLE'
        this.state.generatedWorkflow = null
        return this.setAssistantMessage(fallbackMessage)
      }

      this.state.generatedWorkflow = {
        workflowName: workflow.workflowName,
        steps: workflow.steps,
        estimate_hours: workflow.estimate_hours ?? 2,
        automation_score: workflow.automation_score ?? 0.8,
        summary: workflow.summary ?? '',
        nodeConfigs: [],
      }

      this.state.stage = 'AWAITING_CONFIRMATION'

      const displayMessage =
        result.message ??
        this.buildWorkflowSummaryMessage(workflow.steps, workflow.workflowName)

      return this.setAssistantMessage(displayMessage)
    } catch (error: unknown) {
      console.error('[Copilot] generateWorkflow error:', error)
      return this.handleError(
        `Gagal membuat workflow: ${error instanceof Error ? error.message : 'Unknown error'}`
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
          '🧪 Siap! Saya akan melakukan sandbox testing workflow sekarang...\n\n_(Ini mungkin memakan waktu beberapa detik)_'
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
          'Oke, ceritakan apa yang kurang sesuai atau perlu diubah dari workflow ini?',
        )

      case 'cancel':
        this.state.stage = 'IDLE'
        return this.setAssistantMessage('Workflow dibatalkan. Ada yang bisa saya bantu?')

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
      return this.handleError('Tidak ada workflow untuk di-test.')
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
                  ? `${node.nodeName} berhasil diuji di sandbox.`
                  : `${node.nodeName} gagal saat pengujian sandbox.`,
              outputData: { validationMode: bridgeResult.dummyTest?.validationMode },
              errorDetail:
                (node.status === 'success' || node.status === 'structure_validated') ? null : node.status,
              timestamp: new Date().toISOString(),
            }))
          : this.state.generatedWorkflow.steps.map((step) => ({
              stepId: step.id,
              status: bridgeResult.dummyTest?.passed ? 'success' : 'error',
              message: bridgeResult.dummyTest?.passed
                ? `${step.title} berhasil divalidasi di sandbox.`
                : `${step.title} gagal divalidasi di sandbox.`,
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
        this.setAssistantMessage(
          `⚠️ ${failedSteps.length} langkah gagal saat testing (percobaan ${attempt}/3):\n` +
            failedSteps
              .map((f) => `• **${f.stepId}**: ${f.errorDetail || f.message}`)
              .join('\n') +
            `\n\n🔧 ZeroClaw sedang memperbaiki otomatis...`,
        )
        await this.repairWorkflow(failedSteps)
        return this.runTests(attempt + 1)
      }

      const errorSummary = failedSteps
        .map((f) => `• **${f.stepId}**: ${f.errorDetail || f.message}`)
        .join('\n')
      return this.handleError(
        `Workflow gagal setelah ${attempt}x perbaikan otomatis.\n\nError yang tersisa:\n${errorSummary}\n\nSilakan jelaskan detail teknis tambahan agar saya bisa membantu memperbaiki secara manual.`,
      )
    } catch (error: unknown) {
      console.error('[Copilot] runTests error:', error)
      const message =
        error instanceof Error ? error.message : 'Terjadi error saat testing.'
      return this.handleError(`Terjadi error saat sandbox testing: ${message}`)
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

      this.state.generatedWorkflow.steps = repairedWorkflow.steps.map((step) => {
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
        const message = typeof result?.message === 'string' && result.message.trim()
          ? result.message
          : 'Saya belum bisa memproses perubahan itu. Coba jelaskan dengan lebih detail langkah yang ingin diubah.'
        return this.setAssistantMessage(message)
      }

      this.state.generatedWorkflow.steps = editedWorkflow.steps
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

      const displayMessage =
        result.message ??
        this.buildWorkflowSummaryMessage(
          this.state.generatedWorkflow.steps,
          this.state.generatedWorkflow.workflowName,
          true,
        )

      return this.setAssistantMessage(displayMessage)
    } catch (error: unknown) {
      console.error('[Copilot] handleEditing error:', error)
      return this.handleError(
        'Gagal mengedit workflow. Coba jelaskan perubahan yang diinginkan.',
      )
    }
  }

  private async handleApplyApproval(userMessage: string): Promise<CopilotConversationState> {
    const intent = detectUserIntent(userMessage)

    if (intent === 'confirm' || intent === 'apply') {
      this.state.userApprovals.approvedTest = true
      this.state.stage = 'AWAITING_APPLY_APPROVAL'
      return this.setAssistantMessage(
        `Workflow sudah lolos sandbox test. Klik tombol **Apply to canvas** untuk menaruh workflow "${this.state.generatedWorkflow?.workflowName}" ke canvas.`,
      )
    }

    if (intent === 'edit') {
      this.state.stage = 'EDITING'
      return this.handleEditing(userMessage)
    }

    if (intent === 'reject' || intent === 'cancel') {
      this.state.stage = 'IDLE'
      return this.setAssistantMessage(
        'Baik, workflow tidak diterapkan. Tersimpan sebagai draft. Ada yang bisa saya bantu?',
      )
    }

    return this.setAssistantMessage(
      'Apakah Anda ingin menerapkan workflow ini ke canvas? Balas **ya** untuk apply atau **tidak** untuk batalkan.',
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
        `✏️ Workflow sudah diperbarui!\n\n${stepList}${summary}\n\n` +
        `Apakah sudah sesuai sekarang? Balas **ya** untuk lanjut testing.`
      )
    }

    return (
      `✅ Saya sudah membuat workflow **"${workflowName}"** dengan ${steps.length} langkah:\n\n` +
      `${stepList}${summary}\n\n` +
      `Apakah sudah sesuai dengan kebutuhan Anda? Balas **ya** untuk lanjut testing, ` +
      `**edit** untuk mengubah, atau jelaskan apa yang perlu diperbaiki.`
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
      attempts > 1 ? `_(Berhasil setelah ${attempts}x perbaikan otomatis)_\n\n` : ''

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
        '\n\n---\n📋 **Konfigurasi Detail Setiap Node:**\n\n' +
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
      `✅ **Sandbox testing selesai! ${passed} berhasil, ${skipped} dilewati, dari ${total} langkah total.**\n_Validasi: ${wf.dummyTest?.validationMode || 'sandbox'}_\n\n` +
      attemptNote +
      `${testSummary}\n\n` +
      `---\n📌 **Ringkasan Workflow:**\n${wf.summary}` +
      nodeDetails +
      `\n\n---\n🚀 **Workflow "${wf.workflowName}" siap diterapkan. Klik tombol Apply to canvas untuk menaruhnya ke canvas.**`
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