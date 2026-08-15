/**
 * Regression suite for docs/BLUEPRINT-WORKFLOW-GRAPH-DETERMINISM-2026-08-15.md
 * — five findings against a live-generated "Customer Onboarding Workflow"
 * canvas (CRM/Slack/Zendesk/Asana defaults already decided, Product tracking
 * newly reported as an undecided category).
 *
 * Findings 2, 3 and 5 were genuine bugs, fixed here:
 *   - Finding 5: the data-incomplete exception branch ended on an
 *     unconditional n8n-nodes-base.wait node (resume: webhook) with no
 *     resumeUrl ever captured and no reference to it anywhere upstream —
 *     unresumable in practice. Fixed to the same safe fallback already used
 *     for the approval-outcome branch: a manual-status Set node, no Wait.
 *   - Finding 3: a business-action step needing task/project-management
 *     tooling ("push tasks to the responsible team") could only resolve to
 *     the decided Asana default when the blueprint's own
 *     `integrations_required` list happened to declare a "Task management"
 *     category. This blueprint never does (it declares CRM/Communication/
 *     Helpdesk/Product tracking only) — same class of upstream-label blind
 *     spot as isHumanReviewLike() (blueprintPlanner.typeRobustness.test.ts),
 *     but in tool resolution rather than branch detection. Fixed with a
 *     text-based fallback.
 *   - Finding 2: buildExceptionGate() could fire twice for one blueprint —
 *     once opportunistically off ANY ai_processing step whose text matches
 *     /validat/ (independent of `gateIdx`), and once for the actual
 *     `gateIdx` step chosen to anchor the real human-review branch. When a
 *     blueprint has two ai_processing steps (e.g. "validate" AND
 *     "classify") and `gateIdx` picks the one that ISN'T the validate step,
 *     both fired, producing two "Data complete?" nodes. Fixed by skipping
 *     the opportunistic gate whenever a real gate is already scheduled
 *     elsewhere in the same blueprint.
 *
 * Finding 1 (an AI Agent node for "classify based on tier/product selection"
 * instead of a deterministic Switch) was investigated and left AS-IS,
 * deliberately: see the aiReasoning.reason on the classify step below and
 * buildDecisionNodes() in blueprintPlanner.ts — a wrong guess toward Switch
 * fails silently (wrong/no route, no error), a wrong guess toward AI just
 * costs one extra LLM call. Revisit via production telemetry, not by
 * widening the heuristic on suspicion.
 *
 * Finding 4 ("Product tracking system" has no decided default) was found to
 * already be correct, unchanged behavior — covered here as a non-regression
 * check, not a fix.
 */
import { describe, it, expect } from 'vitest'
import {
  planWorkflowFromBlueprintModule,
  validatePlannedWorkflow,
  validateN8nGraph,
  type BlueprintModuleInput,
  type PlannedStep,
} from './blueprintPlanner'
import { convertToN8nWorkflow } from '../workflowConverter'

// ── The exact reported blueprint (CRM/Slack/Zendesk/Asana already decided,
// Product tracking newly reported, data-incomplete path only — no separate
// approve-exceptions step in this run) ─────────────────────────────────────

const CRM_ONBOARDING_BLUEPRINT: BlueprintModuleInput = {
  workflow_id: 'wf-crm-onboarding',
  name: 'Customer Onboarding Workflow',
  trigger: 'A new customer record or onboarding request enters the system',
  steps: [
    { type: 'ingestion', action: 'Detect new customer account or onboarding request' },
    { type: 'ai_processing', action: 'Validate customer data and enrich any missing fields against the central data layer' },
    { type: 'ai_processing', action: 'Classify the onboarding path based on customer tier and product selection' },
    { type: 'execution', action: 'Generate the onboarding task list, milestones, and assigned owners' },
    { type: 'execution', action: 'Send welcome communications and push tasks to the responsible team' },
    { type: 'execution', action: 'Alert the account owner on completion or flag exceptions for review' },
  ],
  integrations_required: ['CRM system', 'Customer communication channels', 'Helpdesk system', 'Product tracking system'],
}

function findConnections(n8n: ReturnType<typeof convertToN8nWorkflow>, from: string) {
  const byType = n8n.connections[from] as Record<string, Array<Array<{ node: string }>>> | undefined
  return byType?.main ?? []
}

function buildGraph() {
  const planned = planWorkflowFromBlueprintModule(CRM_ONBOARDING_BLUEPRINT)
  const n8n = convertToN8nWorkflow({
    workflow_id: 'wf-crm-onboarding',
    title: CRM_ONBOARDING_BLUEPRINT.name,
    trigger: planned.trigger,
    steps: planned.steps,
    skipAutoLimit: true,
    assumptions: planned.assumptions,
    needsClarification: planned.needsClarification,
  })
  return { planned, n8n }
}

function flattenBranchSteps(steps: PlannedStep[]): PlannedStep[] {
  const out: PlannedStep[] = []
  for (const s of steps) {
    out.push(s)
    for (const b of s.branches ?? []) out.push(...flattenBranchSteps(b.steps))
  }
  return out
}

describe('regression: 2026-08-15 audit — Customer Onboarding Workflow (CRM/Slack/Zendesk/Asana defaults)', () => {
  it('produces a structurally valid plan and a fully-connected graph', () => {
    const { planned, n8n } = buildGraph()
    expect(validatePlannedWorkflow(planned).errors).toEqual([])
    expect(validateN8nGraph(n8n as any).errors).toEqual([])
  })

  // ── Finding 2 ──────────────────────────────────────────────────────────
  describe('Finding 2: no duplicate "Data complete?" gate', () => {
    it('has exactly one condition node in the whole graph, even though both "Validate…" and "Classify…" are ai_processing steps', () => {
      const { n8n } = buildGraph()
      const conditionNodes = n8n.nodes.filter((n) => n.type === 'n8n-nodes-base.if')
      expect(conditionNodes.length).toBe(1)
      expect(conditionNodes[0].name).toMatch(/Data complete\?/)
    })

    it('the single gate is anchored on the Classify step (gateIdx), not duplicated off the Validate step', () => {
      const { planned } = buildGraph()
      const gates = planned.steps.filter((s) => s.type === 'condition')
      expect(gates.length).toBe(1)
      expect(gates[0].action).toMatch(/Classify the onboarding path/)
    })
  })

  // ── Finding 3 ──────────────────────────────────────────────────────────
  describe('Finding 3: task/project-management tooling resolves to Asana from text alone', () => {
    it('"Generate the onboarding task list…" resolves to native Asana with no declared "Task management" category', () => {
      const { n8n } = buildGraph()
      const node = n8n.nodes.find((n) => /Generate the onboarding task list/i.test(n.name))
      expect(node).toBeDefined()
      expect(node!.type).toBe('n8n-nodes-base.asana')
    })

    it('"push tasks to the responsible team" resolves to native Asana, not a generic/unresolved HTTP placeholder', () => {
      const { n8n } = buildGraph()
      const node = n8n.nodes.find((n) => /push tasks to the responsible team/i.test(n.name))
      expect(node).toBeDefined()
      expect(node!.type).toBe('n8n-nodes-base.asana')
      expect(String((node!.parameters as any)?.url ?? '')).not.toContain('UNRESOLVED_INTEGRATION')
    })
  })

  // ── Finding 4 (non-regression: already correct) ───────────────────────
  it('Finding 4: "Product tracking system" surfaces as needsClarification, not a guessed default', () => {
    const { planned } = buildGraph()
    expect(planned.needsClarification).toContain('Product tracking system')
    expect(planned.assumptions?.some((a) => /Product tracking/i.test(a))).toBe(false)
  })

  // ── Finding 1 (non-regression: deliberately left as AI node) ───────────
  it('Finding 1: "Classify…" stays an AI Agent node and documents why (not silently switched to a deterministic Switch)', () => {
    const { planned, n8n } = buildGraph()
    const classifyStep = flattenBranchSteps(planned.steps).find((s) => /Classify the onboarding path/i.test(s.action))
    expect(classifyStep).toBeDefined()
    expect(classifyStep!.forceIntent).toBe('ai')
    expect(classifyStep!.aiReasoning?.deterministic_alternative_available).toBe(false)
    expect(classifyStep!.aiReasoning?.reason?.trim().length).toBeGreaterThan(0)

    const agentNode = n8n.nodes.find((n) => n.type === '@n8n/n8n-nodes-langchain.agent' && /Classify the onboarding path/i.test(n.name))
    expect(agentNode).toBeDefined()
    // The governance metadata must be embedded in the exported n8n JSON too —
    // future maintainers looking at the raw workflow (not the planner
    // source) can see the same "why", per the existing AI-governance
    // convention (see graphSemantics.test.ts's NON-NEGOTIABLE suite).
    expect((agentNode!.parameters as any)?.aiReasoning?.deterministic_alternative_available).toBe(false)
  })

  // ── Finding 5 — end-to-end, not just a structural presence check ───────
  describe('Finding 5: the data-incomplete branch has no unresumable Wait node', () => {
    it('ships zero n8n-nodes-base.wait nodes anywhere in the graph', () => {
      const { n8n } = buildGraph()
      expect(n8n.nodes.some((n) => n.type === 'n8n-nodes-base.wait')).toBe(false)
    })

    it('walking the FALSE/incomplete branch end-to-end: gate → notify requester → terminal manual-status node, dead end', () => {
      const { n8n } = buildGraph()
      const gateNode = n8n.nodes.find((n) => n.type === 'n8n-nodes-base.if' && /Data complete\?/.test(n.name))!
      expect(gateNode).toBeDefined()

      // FALSE output (index 1) must lead into exception handling.
      const falseTargets = findConnections(n8n, gateNode.name)[1]?.map((t) => t.node) ?? []
      expect(falseTargets.length).toBeGreaterThan(0)

      // Walk the branch forward from the FALSE output to the terminal node,
      // asserting each hop is the node we expect — a real graph traversal,
      // not just "does a node with this name exist somewhere".
      let current = falseTargets[0]
      const visited: string[] = [current]
      for (let i = 0; i < 10; i++) {
        const next = findConnections(n8n, current)[0]?.map((t) => t.node) ?? []
        if (next.length === 0) break
        current = next[0]
        visited.push(current)
      }

      expect(visited.some((n) => /Alert the account owner|flag exceptions/i.test(n))).toBe(true)
      expect(visited.some((n) => /Request missing information from requester/i.test(n))).toBe(true)
      const terminalName = visited.find((n) => /awaiting_manual_resolution/i.test(n))
      expect(terminalName).toBeDefined()

      // The terminal node must be the actual end of the branch: no
      // outgoing connection at all (a real dead end, same guarantee the old
      // Wait node was supposed to provide — but this one is honest about not
      // being resumable, instead of silently pretending to be).
      expect(n8n.connections[terminalName!]).toBeUndefined()
      const terminalNode = n8n.nodes.find((n) => n.name === terminalName)!
      expect(terminalNode.type).toBe('n8n-nodes-base.set')
      expect((terminalNode.parameters as any)?.assignments?.assignments?.some((a: any) => a.name === 'case_status')).toBe(true)

      // And the TRUE/complete path must never reach this terminal node —
      // it's genuinely exclusive to the incomplete branch, not just present
      // somewhere in the graph.
      const trueTargets = findConnections(n8n, gateNode.name)[0]?.map((t) => t.node) ?? []
      expect(trueTargets).not.toContain(terminalName)
    })

    it('the notification step that precedes the terminal node resolves to a real channel (native Slack), not an unresolved placeholder', () => {
      // Finding 5's own fix reuses semanticAction() for "Request missing
      // information from requester" instead of a hand-built, unresolved
      // tool label — verify that side effect explicitly, since a silently
      // broken notification would be just as bad as an unresumable Wait.
      const { n8n } = buildGraph()
      const notifyNode = n8n.nodes.find((n) => /Request missing information from requester/i.test(n.name))
      expect(notifyNode).toBeDefined()
      expect(notifyNode!.type).toBe('n8n-nodes-base.slack')
    })
  })
})
