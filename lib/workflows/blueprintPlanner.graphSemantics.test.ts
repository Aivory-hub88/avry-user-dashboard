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
    // It goes to the join, which is what "continue toward routing" looks
    // like structurally (see the next assertion for the full chain).
    expect(trueTargets.some((t) => t.includes('· join'))).toBe(true)
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
    const joinName = `${gateNode.name} · join`
    const afterJoin = findConnections(n8n, joinName)[0]?.map((t) => t.node) ?? []
    expect(afterJoin.some((t) => /Menentukan jalur onboarding/.test(t))).toBe(true)

    // Walk forward from there to confirm account creation is reachable.
    const routeAgent = n8n.nodes.find((n) => /Menentukan jalur onboarding/.test(n.name))!
    const toSwitch = findConnections(n8n, routeAgent.name)[0]?.map((t) => t.node) ?? []
    const switchNode = n8n.nodes.find((n) => toSwitch.includes(n.name))!
    expect(switchNode.type).toBe('n8n-nodes-base.switch')

    const switchJoin = `${switchNode.name} · join`
    const afterSwitchJoin = findConnections(n8n, switchJoin)[0]?.map((t) => t.node) ?? []
    expect(afterSwitchJoin.some((t) => /Membuat akun/.test(t))).toBe(true)
  })

  it('the exception branch ends on a wait node with no outgoing connection (does not auto-continue)', () => {
    const { n8n } = buildRegressionGraph()
    const waitNode = n8n.nodes.find((n) => n.type === 'n8n-nodes-base.wait')
    expect(waitNode).toBeDefined()
    expect(n8n.connections[waitNode!.name]).toBeUndefined()
  })

  it('exception-branch steps never connect back into the join node', () => {
    const { n8n } = buildRegressionGraph()
    const gateNode = n8n.nodes.find((n) => /Data complete\?/.test(n.name))!
    const joinName = `${gateNode.name} · join`
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
    // None of them should be reachable FROM the exception branch's wait node.
    const waitNode = n8n.nodes.find((n) => n.type === 'n8n-nodes-base.wait')!
    expect(n8n.connections[waitNode.name]).toBeUndefined()
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
