/**
 * Graph-semantics regression suite — covers the specific bugs reported
 * against the live "Otomasi Onboarding Pelanggan" generation:
 *   1. TRUE/FALSE branch inversion (complete data routed to the exception
 *      path instead of the other way around).
 *   2. Duplicate "Data complete?" condition nodes.
 *   3. Exception branch silently rejoining normal execution instead of
 *      terminating (review → notify → continue into account creation).
 *   4. Routing only happening after a genuine validation gate.
 *   5. An invented Limit node with no basis in the blueprint.
 * Plus the Stage 8/8b validator rules added to detect all of the above,
 * tested directly against deliberately-broken plans/graphs so a future
 * regression of any of these is caught here, not by a human re-reading the
 * generated canvas.
 */
import { describe, it, expect } from 'vitest'
import {
  planWorkflowFromBlueprintModule,
  validatePlannedWorkflow,
  validateN8nGraph,
  type BlueprintModuleInput,
  type PlannedStep,
  type PlannedWorkflow,
} from './blueprintPlanner'
import { convertToN8nWorkflow } from '../workflowConverter'
import { detectNodeIntent } from './nodeMapper'

// ── The exact regression blueprint from the bug report ────────────────────

const ONBOARDING_BLUEPRINT: BlueprintModuleInput = {
  workflow_id: 'wf-onboarding',
  name: 'Otomasi Onboarding Pelanggan',
  trigger: 'Pelanggan baru terdaftar atau mengajukan permohonan layanan',
  steps: [
    { type: 'ingestion', action: 'Mengambil data pelanggan baru dari formulir pendaftaran dan sistem CRM' },
    { type: 'ai_processing', action: 'Memvalidasi kelengkapan data dan mengklasifikasikan jenis layanan yang dibutuhkan' },
    { type: 'decision', action: 'Menentukan jalur onboarding berdasarkan profil dan kebutuhan pelanggan' },
    { type: 'execution', action: 'Membuat akun, mengirimkan materi onboarding, dan menjadwalkan sesi pengenalan' },
    { type: 'notification', action: 'Memberitahukan tim terkait dan pelanggan mengenai status onboarding' },
    { type: 'human_review', action: 'Meninjau kasus luar biasa atau data yang tidak lengkap sebelum diproses lebih lanjut' },
  ],
  integrations_required: ['CRM', 'Customer Communication', 'Scheduling'],
}

function findConnections(n8n: ReturnType<typeof convertToN8nWorkflow>, from: string) {
  const byType = n8n.connections[from] as Record<string, Array<Array<{ node: string }>>> | undefined
  return byType?.main ?? []
}

/**
 * Resolve the synthetic branch-merge join node a router's given output feeds
 * into. The converter names these joins `Merge N` (short + generic, commit
 * e78b36d — the old `${router.name} · join` title rendered as a near-
 * duplicate of the router step on canvas), so the join is found structurally
 * by node type, not by name pattern.
 */
function joinTargetOf(n8n: ReturnType<typeof convertToN8nWorkflow>, from: string, output = 0): string | null {
  const targets = findConnections(n8n, from)[output]?.map((t) => t.node) ?? []
  const join = targets.find((t) => n8n.nodes.some((n) => n.name === t && n.type === 'n8n-nodes-base.noOp' && /^Merge \d+$/.test(n.name)))
  return join ?? null
}

function buildRegressionGraph() {
  const planned = planWorkflowFromBlueprintModule(ONBOARDING_BLUEPRINT)
  const n8n = convertToN8nWorkflow({
    workflow_id: 'wf-onboarding',
    title: ONBOARDING_BLUEPRINT.name,
    trigger: planned.trigger,
    steps: planned.steps,
    skipAutoLimit: true,
  })
  return { planned, n8n }
}

describe('regression: Otomasi Onboarding Pelanggan — exact bug-report blueprint', () => {
  it('produces a structurally valid plan and a fully-connected graph', () => {
    const { planned, n8n } = buildRegressionGraph()
    const planValidation = validatePlannedWorkflow(planned)
    expect(planValidation.errors).toEqual([])
    expect(planValidation.valid).toBe(true)

    const graphValidation = validateN8nGraph(n8n as any)
    expect(graphValidation.errors).toEqual([])
    expect(graphValidation.valid).toBe(true)
  })

  it('TRUE output of "Data complete?" continues toward routing, not the exception branch', () => {
    const { n8n } = buildRegressionGraph()
    const gateNode = n8n.nodes.find((n) => /Data complete\?/.test(n.name))!
    expect(gateNode.type).toBe('n8n-nodes-base.if')

    const trueTargets = findConnections(n8n, gateNode.name)[0]?.map((t) => t.node) ?? []
    // TRUE (output 0) must NOT go to the human-review/exception node.
    expect(trueTargets.some((t) => /Meninjau|Wait for human resolution/i.test(t))).toBe(false)
    // It goes to the branch-merge join node, which is what "continue toward
    // routing" looks like structurally (see the next assertion for the full
    // chain).
    expect(joinTargetOf(n8n, gateNode.name, 0)).not.toBeNull()
  })

  it('FALSE output of "Data complete?" goes to exception handling', () => {
    const { n8n } = buildRegressionGraph()
    const gateNode = n8n.nodes.find((n) => /Data complete\?/.test(n.name))!
    const falseTargets = findConnections(n8n, gateNode.name)[1]?.map((t) => t.node) ?? []
    expect(falseTargets.some((t) => /Meninjau/.test(t))).toBe(true)
  })

  it('the join reached from TRUE eventually leads to Determine Onboarding Route, then account creation', () => {
    const { n8n } = buildRegressionGraph()
    const gateNode = n8n.nodes.find((n) => /Data complete\?/.test(n.name))!
    const joinName = joinTargetOf(n8n, gateNode.name, 0)!
    expect(joinName).not.toBeNull()
    const afterJoin = findConnections(n8n, joinName)[0]?.map((t) => t.node) ?? []
    expect(afterJoin.some((t) => /Menentukan jalur onboarding/.test(t))).toBe(true)

    // Walk forward from there to confirm account creation is reachable.
    const routeAgent = n8n.nodes.find((n) => /Menentukan jalur onboarding/.test(n.name))!
    const toSwitch = findConnections(n8n, routeAgent.name)[0]?.map((t) => t.node) ?? []
    const switchNode = n8n.nodes.find((n) => toSwitch.includes(n.name))!
    expect(switchNode.type).toBe('n8n-nodes-base.switch')

    const switchJoin = joinTargetOf(n8n, switchNode.name, 0)!
    expect(switchJoin).not.toBeNull()
    const afterSwitchJoin = findConnections(n8n, switchJoin)[0]?.map((t) => t.node) ?? []
    expect(afterSwitchJoin.some((t) => /Membuat akun/.test(t))).toBe(true)
  })

  it('the exception branch ends on a terminal manual-status node with no outgoing connection (does not auto-continue)', () => {
    // Finding 5 (2026-08-15): this branch used to end on an n8n Wait node
    // (resume: webhook) that was never actually resumable — nothing
    // captured/referenced the resume URL. Fixed to the same safe fallback
    // already used for the approval-outcome branch: a manual-status Set
    // node, no Wait node, still a genuine dead end (no outgoing connection).
    const { n8n } = buildRegressionGraph()
    expect(n8n.nodes.some((n) => n.type === 'n8n-nodes-base.wait')).toBe(false)
    const statusNode = n8n.nodes.find((n) => n.type === 'n8n-nodes-base.set' && /awaiting_manual_resolution/i.test(JSON.stringify(n.parameters)))
    expect(statusNode).toBeDefined()
    expect(n8n.connections[statusNode!.name]).toBeUndefined()
  })

  it('exception-branch steps never connect back into the join node', () => {
    const { n8n } = buildRegressionGraph()
    const gateNode = n8n.nodes.find((n) => /Data complete\?/.test(n.name))!
    const joinName = joinTargetOf(n8n, gateNode.name, 0)!
    expect(joinName).not.toBeNull()
    // Nothing in the connections table should target the join except the
    // gate's own TRUE output.
    const targetsOfJoin: string[] = []
    for (const [from, byType] of Object.entries(n8n.connections)) {
      for (const branches of Object.values(byType as Record<string, any[]>)) {
        for (const arr of branches as any[]) {
          for (const t of arr) if (t.node === joinName) targetsOfJoin.push(from)
        }
      }
    }
    expect(targetsOfJoin).toEqual([gateNode.name])
  })

  it('does not contain a duplicate "Data complete?" condition node', () => {
    const { n8n } = buildRegressionGraph()
    const conditionNodes = n8n.nodes.filter((n) => n.type === 'n8n-nodes-base.if' && /Data complete\?/.test(n.name))
    expect(conditionNodes.length).toBe(1)
  })

  it('does not invent a Limit node', () => {
    const { n8n } = buildRegressionGraph()
    expect(n8n.nodes.some((n) => n.type === 'n8n-nodes-base.limit')).toBe(false)
  })

  it('business actions (create account, send materials, schedule, notify, log) are all present and reachable only via the complete path', () => {
    const { n8n } = buildRegressionGraph()
    for (const label of ['Membuat akun', 'mengirimkan materi onboarding', 'menjadwalkan sesi pengenalan', 'Memberitahukan tim terkait']) {
      expect(n8n.nodes.some((n) => n.name.includes(label))).toBe(true)
    }
    // None of them should be reachable FROM the exception branch's terminal
    // manual-status node (see Finding 5 — no Wait node on this path anymore).
    const statusNode = n8n.nodes.find((n) => n.type === 'n8n-nodes-base.set' && /awaiting_manual_resolution/i.test(JSON.stringify(n.parameters)))!
    expect(statusNode).toBeDefined()
    expect(n8n.connections[statusNode.name]).toBeUndefined()
  })
})

// ── New: structural regression for bug 1-6 fixes ──────────────────────────

describe('regression: structured output, data flow, routing, integrations', () => {
  it('BUG 1+2: validation AI step carries aiOutputSchema with is_complete field', () => {
    const { planned } = buildRegressionGraph()
    const validationStep = planned.steps.find((s: PlannedStep) =>
      s.category?.includes('AI_REASONING') && /validasi|validate/i.test(s.action)
    )
    expect(validationStep).toBeDefined()
    expect(validationStep!.aiOutputSchema).toBeDefined()
    expect(validationStep!.aiOutputSchema!.is_complete).toBeDefined()
    expect(validationStep!.aiOutputSchema!.service_type).toBeDefined()
    expect(validationStep!.aiOutputSchema!.missing_fields).toBeDefined()
  })

  it('BUG 1: "Data complete?" condition node uses conditionField "is_complete"', () => {
    const { planned } = buildRegressionGraph()
    const condition = planned.steps.find((s: PlannedStep) => s.type === 'condition')
    expect(condition).toBeDefined()
    expect(condition!.conditionField).toBe('is_complete')
  })

  it('BUG 4: routing AI step carries aiOutputSchema with onboarding_route', () => {
    const { planned } = buildRegressionGraph()
    const routeAi = planned.steps.find((s: PlannedStep) =>
      s.category?.includes('AI_REASONING') && s.category?.includes('DECISION')
    )
    expect(routeAi).toBeDefined()
    expect(routeAi!.aiOutputSchema).toBeDefined()
    expect(routeAi!.aiOutputSchema!.onboarding_route).toBeDefined()
  })

  it('BUG 4: switch node uses conditionField "onboarding_route"', () => {
    const { planned } = buildRegressionGraph()
    const switchNode = planned.steps.find((s: PlannedStep) => s.type === 'switch')
    expect(switchNode).toBeDefined()
    expect(switchNode!.conditionField).toBe('onboarding_route')
  })

  it('BUG 3 / Finding 5: terminal exception step does NOT claim "re-validation", and is not an unresumable wait', () => {
    const { planned } = buildRegressionGraph()
    const allSteps = flattenBranchSteps(planned.steps)
    // No step in this plan should represent itself as a Wait/resume point —
    // see Finding 5 (2026-08-15): the old "Wait for human resolution" step
    // implied resumability that was never actually wired up.
    expect(allSteps.some((s: PlannedStep) => /wait for human/i.test(s.action))).toBe(false)
    const terminalStep = allSteps.find((s: PlannedStep) => /awaiting_manual_resolution/i.test(s.action))
    expect(terminalStep).toBeDefined()
    expect(terminalStep!.action).not.toMatch(/re-validation/)
    expect(terminalStep!.action).toMatch(/branch ends here/)
  })

  it('BUG 1: generated IF condition uses $json.is_complete boolean, not $json.response isNotEmpty', () => {
    const { n8n } = buildRegressionGraph()
    const ifNode = n8n.nodes.find((n) => n.type === 'n8n-nodes-base.if' && /Data complete\?/.test(n.name))
    expect(ifNode).toBeDefined()
    const conds = (ifNode!.parameters as any)?.conditions?.conditions as Array<Record<string, any>>
    expect(conds).toBeDefined()
    expect(conds.some((c) => c.leftValue?.includes('$json.response') && c.operator?.operation === 'isNotEmpty')).toBe(false)
    expect(conds.some((c) => c.leftValue?.includes('$json.is_complete') && c.operator?.operation === 'equals')).toBe(true)
  })

  it('BUG 2: AI agent node does NOT reference $("Webhook Trigger") — consumes previous node output', () => {
    const { n8n } = buildRegressionGraph()
    const agentNodes = n8n.nodes.filter((n) => n.type === '@n8n/n8n-nodes-langchain.agent')
    for (const agent of agentNodes) {
      const params = JSON.stringify(agent.parameters ?? {})
      expect(params).not.toContain('$("Webhook Trigger")')
    }
  })

  it('BUG 4: switch branches check $json.onboarding_route, not $json.response', () => {
    const { n8n } = buildRegressionGraph()
    const switchNode = n8n.nodes.find((n) => n.type === 'n8n-nodes-base.switch')
    expect(switchNode).toBeDefined()
    const rules = (switchNode!.parameters as any)?.rules?.values as Array<{ conditions?: { conditions?: Array<Record<string, any>> } }>
    expect(rules).toBeDefined()
    for (const rule of rules) {
      const cond = rule?.conditions?.conditions?.[0]
      expect(cond?.leftValue).toContain('$json.onboarding_route')
    }
  })

  it('BUG 6: unresolved ingestion uses UNRESOLVED_INTEGRATION placeholder in generated HTTP node', () => {
    // Use a step whose action text does NOT mention the integration name
    // at all — the integration is declared in integrations_required but the
    // ingestion text doesn't name it, so no integration label is matched
    // and the step genuinely becomes unresolved.
    const blueprint: BlueprintModuleInput = {
      workflow_id: 'wf-unresolved',
      name: 'Unresolved Test',
      trigger: 'Manual',
      steps: [
        { type: 'execution', action: 'Create customer record' },
      ],
      integrations_required: [],
    }
    const planned = planWorkflowFromBlueprintModule(blueprint)
    const n8n = convertToN8nWorkflow({
      workflow_id: 'wf-unresolved',
      title: blueprint.name,
      trigger: planned.trigger,
      steps: planned.steps,
      skipAutoLimit: true,
    })
    const httpNodes = n8n.nodes.filter((n) => n.type === 'n8n-nodes-base.httpRequest')
    // The unresolved business action without a specific integration
    // should get the UNRESOLVED_INTEGRATION placeholder URL.
    const createRecord = httpNodes.find((n) => n.name.includes('Create'))
    expect(createRecord).toBeDefined()
    expect(String((createRecord!.parameters as any)?.url ?? '')).toContain('UNRESOLVED')
  })
})

// ── NON-NEGOTIABLE: AI Agent governance regression ────────────────────────

describe('NON-NEGOTIABLE: AI Agent must not be used for deterministic actions', () => {
  const PROHIBITED_AI_ACTIONS = [
    /get (registration|customer|crm)/i,
    /get data from/i,
    /create.*account|membuat akun/i,
    /send.*material|mengirimkan materi/i,
    /schedule.*session|menjadwalkan sesi/i,
    /notify.*team|memberitahukan tim/i,
    /notify.*customer|pelanggan mengenai/i,
    /log.*result|log workflow/i,
    /merge.*record|merge record/i,
  ]

  it('no prohibited deterministic task is represented as an AI Agent node in the n8n graph', () => {
    const { n8n } = buildRegressionGraph()
    const agentNodes = n8n.nodes.filter((n) => n.type === '@n8n/n8n-nodes-langchain.agent')
    for (const agent of agentNodes) {
      for (const prohibited of PROHIBITED_AI_ACTIONS) {
        expect(agent.name).not.toMatch(prohibited)
      }
    }
  })

  it('AI Agents are ONLY present for validate+classify and determine route', () => {
    const { planned } = buildRegressionGraph()
    const allSteps = flattenBranchSteps(planned.steps)
    const aiSteps = allSteps.filter((s) => (s.forceIntent ?? detectNodeIntent(s.action, s.tool)) === 'ai')
    expect(aiSteps.length).toBe(2)
    expect(aiSteps.some((s) => /validasi|validate/i.test(s.action))).toBe(true)
    expect(aiSteps.some((s) => /tentukan|determine|jalur|route/i.test(s.action))).toBe(true)
  })

  it('every AI Agent carries aiReasoning metadata with deterministic_alternative_available === false', () => {
    const { planned } = buildRegressionGraph()
    const allSteps = flattenBranchSteps(planned.steps)
    const aiSteps = allSteps.filter((s) => (s.forceIntent ?? detectNodeIntent(s.action, s.tool)) === 'ai')
    for (const s of aiSteps) {
      expect(s.aiReasoning).toBeDefined()
      expect(s.aiReasoning!.reasoning_required).toBe(true)
      expect(s.aiReasoning!.deterministic_alternative_available).toBe(false)
      expect(s.aiReasoning!.reason.trim().length).toBeGreaterThan(0)
    }
  })

  it('every AI Agent node in the n8n graph has aiReasoning metadata embedded in its parameters', () => {
    const { n8n } = buildRegressionGraph()
    const agentNodes = n8n.nodes.filter((n) => n.type === '@n8n/n8n-nodes-langchain.agent')
    for (const agent of agentNodes) {
      const meta = (agent.parameters as any)?.aiReasoning
      expect(meta).toBeDefined()
      expect(meta.deterministic_alternative_available).toBe(false)
      expect(meta.reasoning_required).toBe(true)
    }
  })

  it('the validator FAILS when a deterministic action (Membuat akun) is forced to be an AI Agent', () => {
    const broken: PlannedStep = {
      step: 1,
      action: 'Membuat akun',
      tool: 'Aivory AI',
      output: '',
      type: 'action',
      category: ['BUSINESS_ACTION'],
      forceIntent: 'ai',
      aiReasoning: {
        reasoning_required: true,
        reason: 'test',
        deterministic_alternative_available: false,
      },
    }
    const result = validatePlannedWorkflow(wrap([broken]))
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => /deterministic operation.*AI Agent/i.test(e))).toBe(true)
  })

  it('the validator FAILS when an AI Agent is missing aiReasoning metadata', () => {
    const noMetadata: PlannedStep = {
      step: 1,
      action: 'Classify customer sentiment from feedback text',
      tool: 'Aivory AI',
      output: '',
      type: 'action',
      category: ['AI_REASONING'],
      forceIntent: 'ai',
    }
    const result = validatePlannedWorkflow(wrap([noMetadata]))
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => /no aiReasoning metadata/i.test(e))).toBe(true)
  })

  it('the validator FAILS when deterministic_alternative_available === true', () => {
    const hasAlternative: PlannedStep = {
      step: 1,
      action: 'Classify customer sentiment',
      tool: 'Aivory AI',
      output: '',
      type: 'action',
      category: ['AI_REASONING'],
      forceIntent: 'ai',
      aiReasoning: {
        reasoning_required: true,
        reason: 'test',
        deterministic_alternative_available: true,
      },
    }
    const result = validatePlannedWorkflow(wrap([hasAlternative]))
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => /deterministic_alternative_available=true/i.test(e))).toBe(true)
  })

  it('the onboarding workflow graph matches the required target shape', () => {
    const { n8n } = buildRegressionGraph()
    const required = [
      /Webhook Trigger/i,
      /Get data from Registration Form/i,
      /Get data from CRM/i,
      /Merge records/i,
      /Memvalidasi/i,
      /Data complete\?/i,
      /Menentukan jalur onboarding/i,
      /Route:/i,
      /Membuat akun/i,
      /mengirimkan materi/i,
      /menjadwalkan sesi/i,
      /Memberitahukan tim/i,
      /pelanggan mengenai/i,
      /Log workflow result/i,
    ]
    for (const re of required) {
      expect(n8n.nodes.some((n) => re.test(n.name))).toBe(true)
    }
    expect(n8n.nodes.some((n) => /Meninjau/i.test(n.name))).toBe(true)
    // Finding 5 (2026-08-15): no Wait node ships on this branch anymore —
    // it was never actually resumable. The terminal step is a manual-status
    // Set node instead (see the dedicated regression tests above).
    expect(n8n.nodes.some((n) => n.type === 'n8n-nodes-base.wait')).toBe(false)
  })

  // The export/re-render path (app/workflows/page.tsx toExportStep,
  // components/workflow/WorkflowCanvas.tsx toConverterFallbackStep) used to
  // rebuild each step from only {action, tool, output, type, branches},
  // silently dropping forceIntent/conditionField/aiOutputSchema/aiReasoning/
  // unresolvedIntegration — which re-introduced AI Agents for deterministic
  // actions and re-lost the is_complete/onboarding_route fields. This test
  // proves a JSON round-trip (localStorage/API serialization) + the fixed
  // field-preserving mapping keeps the graph correct.
  it('preserves planner fields through a save/load round-trip (no AI-Agent regression)', () => {
    const { planned } = buildRegressionGraph()
    const json = JSON.stringify(planned.steps)
    const restored: PlannedStep[] = JSON.parse(json)

    // The field-preserving mapping the export/canvas paths now use.
    const remap = (steps: PlannedStep[]): any[] => steps.map((s, i) => ({
      step: i + 1,
      action: s.action,
      tool: s.tool,
      output: s.output,
      type: s.type,
      branches: s.branches?.map((b) => ({
        key: b.key,
        label: b.label,
        steps: remap(b.steps),
        terminal: b.terminal,
      })),
      forceIntent: s.forceIntent,
      conditionField: s.conditionField,
      aiOutputSchema: s.aiOutputSchema,
      aiReasoning: s.aiReasoning,
      unresolvedIntegration: s.unresolvedIntegration,
    }))

    const n8n = convertToN8nWorkflow({
      workflow_id: 'wf-onboarding',
      title: 'Otomasi Onboarding Pelanggan',
      trigger: planned.trigger,
      steps: remap(restored),
      skipAutoLimit: true,
    })

    const agents = n8n.nodes.filter((n) => n.type === '@n8n/n8n-nodes-langchain.agent')
    expect(agents.length).toBe(2)

    const ifNode = n8n.nodes.find((n) => n.type === 'n8n-nodes-base.if' && /Data complete\?/.test(n.name))
    const conds = (ifNode!.parameters as any)?.conditions?.conditions as Array<Record<string, any>>
    expect(conds.some((c) => c.leftValue?.includes('$json.is_complete') && c.operator?.type === 'boolean')).toBe(true)

    const sw = n8n.nodes.find((n) => n.type === 'n8n-nodes-base.switch')
    const rules = (sw!.parameters as any)?.rules?.values as Array<{ conditions?: { conditions?: Array<Record<string, any>> } }>
    expect(rules.every((r) => r.conditions?.conditions?.[0]?.leftValue?.includes('$json.onboarding_route'))).toBe(true)
  })
})

// ── Validator regression tests — prove the rules themselves catch the bug ──

function flattenBranchSteps(steps: PlannedStep[]): PlannedStep[] {
  const out: PlannedStep[] = []
  for (const s of steps) {
    out.push(s)
    for (const b of s.branches ?? []) out.push(...flattenBranchSteps(b.steps))
  }
  return out
}

function wrap(steps: PlannedStep[]): PlannedWorkflow {
  return { trigger: 'Manual', steps, integrations: [], unresolvedIntegrations: [], warnings: [] }
}

describe('validatePlannedWorkflow — catches the exact reported defects', () => {
  it('flags a condition whose TRUE branch leads to exception handling (the reported inversion)', () => {
    const backwards: PlannedStep = {
      step: 1,
      action: 'Data complete? (validation)',
      tool: 'Condition',
      output: '',
      type: 'condition',
      category: ['DECISION'],
      branches: [
        // Deliberately backwards: TRUE -> exception.
        {
          key: 'incomplete',
          label: 'Incomplete',
          terminal: true,
          steps: [{ step: 2, action: 'Review case', tool: 'Exception Queue', output: '', type: 'action', category: ['HUMAN_REVIEW', 'EXCEPTION_HANDLING'] }],
        },
        { key: 'complete', label: 'Complete', steps: [] },
      ],
    }
    const result = validatePlannedWorkflow(wrap([backwards]))
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => /TRUE branch.*leads to exception/i.test(e))).toBe(true)
  })

  it('passes the same shape once the branch order is corrected', () => {
    const fixed: PlannedStep = {
      step: 1,
      action: 'Data complete? (validation)',
      tool: 'Condition',
      output: '',
      type: 'condition',
      category: ['DECISION'],
      branches: [
        { key: 'complete', label: 'Complete', steps: [] },
        {
          key: 'incomplete',
          label: 'Incomplete',
          terminal: true,
          steps: [{ step: 2, action: 'Review case', tool: 'Exception Queue', output: '', type: 'action', category: ['HUMAN_REVIEW', 'EXCEPTION_HANDLING'] }],
        },
      ],
    }
    const result = validatePlannedWorkflow(wrap([fixed]))
    expect(result.errors).toEqual([])
  })

  it('flags an exception branch that is not marked terminal (would auto-continue)', () => {
    const autoContinues: PlannedStep = {
      step: 1,
      action: 'Data complete? (validation)',
      tool: 'Condition',
      output: '',
      type: 'condition',
      category: ['DECISION'],
      branches: [
        { key: 'complete', label: 'Complete', steps: [] },
        {
          key: 'incomplete',
          label: 'Incomplete',
          // terminal: undefined — the bug being guarded against.
          steps: [{ step: 2, action: 'Review case', tool: 'Exception Queue', output: '', type: 'action', category: ['HUMAN_REVIEW', 'EXCEPTION_HANDLING'] }],
        },
      ],
    }
    const result = validatePlannedWorkflow(wrap([autoContinues]))
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => /marked terminal/i.test(e))).toBe(true)
  })

  it('flags two condition nodes with identical semantics as duplicates', () => {
    const makeGate = (step: number): PlannedStep => ({
      step,
      action: 'Data complete? (validation)',
      tool: 'Condition',
      output: '',
      type: 'condition',
      category: ['DECISION'],
      branches: [
        { key: 'complete', label: 'Complete', steps: [] },
        { key: 'incomplete', label: 'Incomplete', terminal: true, steps: [] },
      ],
    })
    const result = validatePlannedWorkflow(wrap([makeGate(1), makeGate(2)]))
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => /duplicates the condition/i.test(e))).toBe(true)
  })

  it('does not flag two condition nodes with genuinely different semantics', () => {
    const gateA: PlannedStep = {
      step: 1, action: 'Data complete? (validation)', tool: 'Condition', output: '', type: 'condition', category: ['DECISION'],
      branches: [{ key: 'complete', steps: [] }, { key: 'incomplete', terminal: true, steps: [] }],
    }
    const gateB: PlannedStep = {
      step: 2, action: 'Payment amount within auto-approval threshold?', tool: 'Condition', output: '', type: 'condition', category: ['DECISION'],
      branches: [{ key: 'yes', steps: [] }, { key: 'no', terminal: true, steps: [] }],
    }
    const result = validatePlannedWorkflow(wrap([gateA, gateB]))
    expect(result.errors.some((e) => /duplicates the condition/i.test(e))).toBe(false)
  })

  it('warns when a business action is stranded inside a terminal (exception) branch', () => {
    const strandedAction: PlannedStep = {
      step: 1,
      action: 'Data complete? (validation)',
      tool: 'Condition',
      output: '',
      type: 'condition',
      category: ['DECISION'],
      branches: [
        { key: 'complete', steps: [] },
        {
          key: 'incomplete',
          terminal: true,
          steps: [
            { step: 2, action: 'Review case', tool: 'Exception Queue', output: '', type: 'action', category: ['HUMAN_REVIEW', 'EXCEPTION_HANDLING'] },
            // A deterministic business action accidentally left inside the
            // dead-end exception branch — unreachable from the happy path.
            { step: 3, action: 'Create customer account', tool: 'n8n', output: '', type: 'action', category: ['BUSINESS_ACTION'] },
          ],
        },
      ],
    }
    const result = validatePlannedWorkflow(wrap([strandedAction]))
    expect(result.warnings.some((w) => /stranded|unreachable|never run/i.test(w) || /business action/i.test(w))).toBe(true)
  })
})

describe('validateN8nGraph — catches invented Limit nodes and disconnected nodes', () => {
  it('flags an n8n-nodes-base.limit node', () => {
    const graph = {
      nodes: [
        { name: 'Trigger', type: 'n8n-nodes-base.webhook' },
        { name: 'Limit 1', type: 'n8n-nodes-base.limit' },
        { name: 'Action', type: 'n8n-nodes-base.httpRequest' },
      ],
      connections: {
        Trigger: { main: [[{ node: 'Limit 1' }]] },
        'Limit 1': { main: [[{ node: 'Action' }]] },
      },
    }
    const result = validateN8nGraph(graph as any)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => /n8n-nodes-base\.limit/i.test(e))).toBe(true)
  })

  it('flags a node with no incoming connection', () => {
    const graph = {
      nodes: [
        { name: 'Trigger', type: 'n8n-nodes-base.webhook' },
        { name: 'Action', type: 'n8n-nodes-base.httpRequest' },
        { name: 'Orphan', type: 'n8n-nodes-base.httpRequest' },
      ],
      connections: {
        Trigger: { main: [[{ node: 'Action' }]] },
      },
    }
    const result = validateN8nGraph(graph as any)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => /"Orphan".*no incoming/i.test(e))).toBe(true)
  })

  it('does not flag a Wait or respondToWebhook node for lacking an outgoing connection', () => {
    const graph = {
      nodes: [
        { name: 'Trigger', type: 'n8n-nodes-base.webhook' },
        { name: 'Wait', type: 'n8n-nodes-base.wait' },
        { name: 'Respond', type: 'n8n-nodes-base.respondToWebhook' },
      ],
      connections: {
        Trigger: { main: [[{ node: 'Wait' }, { node: 'Respond' }]] },
      },
    }
    const result = validateN8nGraph(graph as any)
    expect(result.errors).toEqual([])
    expect(result.warnings.filter((w) => /no outgoing/i.test(w))).toEqual([])
  })

  it('warns (not errors) about a non-terminal node with no outgoing connection', () => {
    const graph = {
      nodes: [
        { name: 'Trigger', type: 'n8n-nodes-base.webhook' },
        { name: 'DeadEnd', type: 'n8n-nodes-base.httpRequest' },
      ],
      connections: {
        Trigger: { main: [[{ node: 'DeadEnd' }]] },
      },
    }
    const result = validateN8nGraph(graph as any)
    expect(result.valid).toBe(true)
    expect(result.warnings.some((w) => /"DeadEnd".*no outgoing/i.test(w))).toBe(true)
  })

  it('does not flag a LangChain Chat Model sub-node for lacking incoming/outgoing main connections', () => {
    const graph = {
      nodes: [
        { name: 'Trigger', type: 'n8n-nodes-base.webhook' },
        { name: 'Agent', type: '@n8n/n8n-nodes-langchain.agent' },
        { name: 'Chat Model', type: '@n8n/n8n-nodes-langchain.lmChatOpenAi' },
      ],
      connections: {
        Trigger: { main: [[{ node: 'Agent' }]] },
        'Chat Model': { ai_languageModel: [[{ node: 'Agent' }]] },
      },
    }
    const result = validateN8nGraph(graph as any)
    expect(result.errors).toEqual([])
  })
})

// ── New regression: validateN8nGraph catches the new bug classes ──────────

describe('validateN8nGraph — bug 1-8 detection rules', () => {
  it('Rule 1: flags a "Data complete?" IF node that checks $json.response isNotEmpty', () => {
    const graph = {
      nodes: [
        { name: 'Trigger', type: 'n8n-nodes-base.webhook' },
        { name: 'Step 3: Data complete? (validation)', type: 'n8n-nodes-base.if', parameters: { conditions: { conditions: [{ leftValue: '={{ $json.response }}', rightValue: '', operator: { type: 'string', operation: 'isNotEmpty' } }], combinator: 'and', options: {} }, options: {} } },
        { name: 'Action', type: 'n8n-nodes-base.httpRequest' },
      ],
      connections: {
        Trigger: { main: [[{ node: 'Step 3: Data complete? (validation)' }]] },
        'Step 3: Data complete? (validation)': { main: [[{ node: 'Action' }], []] },
      },
    }
    const result = validateN8nGraph(graph as any)
    expect(result.errors.some((e) => /\$json\.response isNotEmpty/i.test(e))).toBe(true)
  })

  it('Rule 1: does NOT flag a "Data complete?" IF node that uses $json.is_complete', () => {
    const graph = {
      nodes: [
        { name: 'Trigger', type: 'n8n-nodes-base.webhook' },
        { name: 'Step 3: Data complete? (validation)', type: 'n8n-nodes-base.if', parameters: { conditions: { conditions: [{ leftValue: '={{ $json.is_complete }}', rightValue: true, operator: { type: 'boolean', operation: 'equals' } }], combinator: 'and', options: {} }, options: {} } },
        { name: 'Action', type: 'n8n-nodes-base.httpRequest' },
      ],
      connections: {
        Trigger: { main: [[{ node: 'Step 3: Data complete? (validation)' }]] },
        'Step 3: Data complete? (validation)': { main: [[{ node: 'Action' }], []] },
      },
    }
    const result = validateN8nGraph(graph as any)
    expect(result.errors.some((e) => /\$json\.response isNotEmpty/i.test(e))).toBe(false)
  })

  it('Rule 2: flags a node referencing $("Webhook Trigger") directly (bypasses upstream data source)', () => {
    const graph = {
      nodes: [
        { name: 'Webhook Trigger', type: 'n8n-nodes-base.webhook' },
        { name: 'Step 1: Get CRM data', type: 'n8n-nodes-base.httpRequest' },
        { name: 'Step 2: AI validation', type: '@n8n/n8n-nodes-langchain.agent', parameters: { text: '={{ $("Webhook Trigger").item.json.body }}' } },
      ],
      connections: {
        'Webhook Trigger': { main: [[{ node: 'Step 1: Get CRM data' }]] },
        'Step 1: Get CRM data': { main: [[{ node: 'Step 2: AI validation' }]] },
      },
    }
    const result = validateN8nGraph(graph as any)
    expect(result.errors.some((e) => /webhook trigger.*directly/i.test(e))).toBe(true)
  })

  it('Rule 4: warns about a "re-validation" node label without an actual re-validation loop', () => {
    const graph = {
      nodes: [
        { name: 'Trigger', type: 'n8n-nodes-base.webhook' },
        { name: 'Wait for human resolution — re-validation', type: 'n8n-nodes-base.wait' },
      ],
      connections: { Trigger: { main: [[{ node: 'Wait for human resolution — re-validation' }]] } },
    }
    const result = validateN8nGraph(graph as any)
    expect(result.warnings.some((w) => /re-validation/i.test(w))).toBe(true)
  })

  it('Rule 6: warns about placeholder integration URLs (example.com)', () => {
    const graph = {
      nodes: [
        { name: 'Trigger', type: 'n8n-nodes-base.webhook' },
        { name: 'Step 1: Create account', type: 'n8n-nodes-base.httpRequest', parameters: { url: 'https://api.example.com/endpoint' } },
      ],
      connections: { Trigger: { main: [[{ node: 'Step 1: Create account' }]] } },
    }
    const result = validateN8nGraph(graph as any)
    expect(result.warnings.some((w) => /placeholder URL/i.test(w))).toBe(true)
  })

  it('Rule 6: warns about UNRESOLVED_INTEGRATION placeholder URLs', () => {
    const graph = {
      nodes: [
        { name: 'Trigger', type: 'n8n-nodes-base.webhook' },
        { name: 'Step 1: Get CRM data', type: 'n8n-nodes-base.httpRequest', parameters: { url: 'UNRESOLVED_INTEGRATION://configure-me' } },
      ],
      connections: { Trigger: { main: [[{ node: 'Step 1: Get CRM data' }]] } },
    }
    const result = validateN8nGraph(graph as any)
    expect(result.warnings.some((w) => /placeholder URL/i.test(w))).toBe(true)
  })

  it('Rule 7: warns about AI Agent nodes without structured-output schema for validation steps', () => {
    const graph = {
      nodes: [
        { name: 'Trigger', type: 'n8n-nodes-base.webhook' },
        { name: 'Step 2: Memvalidasi kelengkapan data', type: '@n8n/n8n-nodes-langchain.agent', parameters: { options: { systemMessage: 'Memvalidasi kelengkapan data dan mengklasifikasikan jenis layanan' } } },
        { name: 'Action', type: 'n8n-nodes-base.httpRequest' },
      ],
      connections: {
        Trigger: { main: [[{ node: 'Step 2: Memvalidasi kelengkapan data' }]] },
        'Step 2: Memvalidasi kelengkapan data': { main: [[{ node: 'Action' }]] },
      },
    }
    const result = validateN8nGraph(graph as any)
    expect(result.warnings.some((w) => /no structured-output schema/i.test(w))).toBe(true)
  })
})
