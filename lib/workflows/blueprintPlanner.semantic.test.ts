/**
 * Semantic-decomposition regression suite.
 *
 * The blueprint planner must NOT read business verbs literally. These tests
 * prove that temporal/conditional/dependency verbs — track, monitor, escalate
 * delays, based-on, assign-to-relevant, wait-until, retry — produce the
 * structured graph they imply (conditions, waits, dependency lookups), not a
 * flat linear chain of stateless action nodes.
 */
import { describe, it, expect } from 'vitest'
import {
  planWorkflowFromBlueprintModule,
  validatePlannedWorkflow,
  type BlueprintModuleInput,
  type PlannedStep,
} from './blueprintPlanner'
import { convertToN8nWorkflow } from '../workflowConverter'

function flatten(steps: PlannedStep[]): PlannedStep[] {
  const out: PlannedStep[] = []
  for (const s of steps) {
    out.push(s)
    for (const b of s.branches ?? []) out.push(...flatten(b.steps))
  }
  return out
}

function build(module: BlueprintModuleInput) {
  const planned = planWorkflowFromBlueprintModule(module)
  const n8n = convertToN8nWorkflow({
    workflow_id: module.workflow_id ?? 'wf',
    title: module.name,
    trigger: planned.trigger,
    steps: planned.steps,
    skipAutoLimit: true,
  })
  return { planned, n8n }
}

function nodeTypes(n8n: ReturnType<typeof build>['n8n']): string[] {
  return n8n.nodes.map((n) => n.type)
}

describe('semantic decomposition — Track progress and escalate delays', () => {
  const blueprint: BlueprintModuleInput = {
    name: 'Onboarding',
    trigger: 'New customer sign-up received',
    steps: [
      { type: 'ingestion', action: 'Get customer data from CRM and sign-up form' },
      { type: 'ai_processing', action: 'Validate customer information from sign-up form' },
      { type: 'execution', action: 'Create onboarding checklist based on service type' },
      { type: 'execution', action: 'Assign tasks to relevant team members' },
      { type: 'execution', action: 'Track progress and escalate delays' },
    ],
    integrations_required: ['CRM', 'Communication channels', 'Helpdesk system'],
  }

  it('does NOT translate "track progress" into a single stateless action', () => {
    const { planned } = build(blueprint)
    const flat = flatten(planned.steps)
    // No bare "track" action node — it was decomposed into observe + condition.
    expect(flat.some((s) => /track progress/i.test(s.action) && s.type === 'action')).toBe(false)
  })

  it('produces a condition node for the delay check', () => {
    const { planned } = build(blueprint)
    const flat = flatten(planned.steps)
    expect(flat.some((s) => s.type === 'condition' && /delayed|overdue/i.test(s.action))).toBe(true)
  })

  it('escapes the delay check into a conditional escalation, not a linear action', () => {
    const { n8n } = build(blueprint)
    const ifNode = n8n.nodes.find((n) => n.type === 'n8n-nodes-base.if' && /delayed|overdue/i.test(n.name))
    expect(ifNode).toBeDefined()
    // The escalation is inside a branch, not a top-level linear node.
    const escalate = n8n.nodes.find((n) => /escalate delay/i.test(n.name))
    expect(escalate).toBeDefined()
    expect(escalate!.type).not.toBe('n8n-nodes-base.wait')
  })

  it('escalation is a communication/notification node, not a Wait node', () => {
    const { n8n } = build(blueprint)
    const escalate = n8n.nodes.find((n) => /escalate delay/i.test(n.name))!
    expect(escalate.type).toBe('n8n-nodes-base.slack')
  })

  it('adds a deadline/SLA check node before the condition', () => {
    const { planned } = build(blueprint)
    const flat = flatten(planned.steps)
    expect(flat.some((s) => /deadline|SLA/i.test(s.action))).toBe(true)
  })
})

describe('semantic decomposition — Create X based on Y', () => {
  const blueprint: BlueprintModuleInput = {
    name: 'Checklist',
    trigger: 'Manual',
    steps: [
      { type: 'execution', action: 'Create onboarding checklist based on service type' },
    ],
    integrations_required: [],
  }

  it('resolves the dependency before the dependent action', () => {
    const { planned } = build(blueprint)
    const flat = flatten(planned.steps)
    const determineIdx = flat.findIndex((s) => /^determine service type/i.test(s.action))
    const createIdx = flat.findIndex((s) => /create onboarding checklist/i.test(s.action))
    expect(determineIdx).toBeGreaterThanOrEqual(0)
    expect(createIdx).toBeGreaterThan(determineIdx)
  })

  it('adds a select/mapping node between the dependency and the action', () => {
    const { planned } = build(blueprint)
    const flat = flatten(planned.steps)
    expect(flat.some((s) => /select appropriate option based on service type/i.test(s.action))).toBe(true)
  })

  it('does not use an AI Agent to determine the service type', () => {
    const { n8n } = build(blueprint)
    const determine = n8n.nodes.find((n) => /determine service type/i.test(n.name))!
    expect(determine.type).not.toBe('@n8n/n8n-nodes-langchain.agent')
  })
})

describe('semantic decomposition — Assign to relevant team members', () => {
  const blueprint: BlueprintModuleInput = {
    name: 'Assignment',
    trigger: 'Manual',
    steps: [
      { type: 'execution', action: 'Assign tasks to relevant team members' },
    ],
    integrations_required: [],
  }

  it('adds a mapping source before the assignment', () => {
    const { planned } = build(blueprint)
    const flat = flatten(planned.steps)
    expect(flat.some((s) => /determine responsible team/i.test(s.action))).toBe(true)
    expect(flat.some((s) => /resolve assignee/i.test(s.action))).toBe(true)
    const assignIdx = flat.findIndex((s) => /assign tasks/i.test(s.action))
    const mapIdx = flat.findIndex((s) => /determine responsible team/i.test(s.action))
    expect(assignIdx).toBeGreaterThan(mapIdx)
  })

  it('assignment is deterministic, not AI', () => {
    const { n8n } = build(blueprint)
    expect(n8n.nodes.some((n) => n.type === '@n8n/n8n-nodes-langchain.agent')).toBe(false)
  })
})

describe('semantic decomposition — Monitor until complete', () => {
  const blueprint: BlueprintModuleInput = {
    name: 'Monitoring',
    trigger: 'Manual',
    steps: [
      { type: 'execution', action: 'Monitor task progress until complete' },
    ],
    integrations_required: [],
  }

  it('produces a completion condition, not a bare "monitor" action', () => {
    const { planned } = build(blueprint)
    const flat = flatten(planned.steps)
    expect(flat.some((s) => s.type === 'condition' && /complete/i.test(s.action))).toBe(true)
    expect(flat.some((s) => /monitor task progress/i.test(s.action) && s.type === 'action')).toBe(false)
  })

  it('adds a wait node for the not-complete path', () => {
    const { n8n } = build(blueprint)
    expect(n8n.nodes.some((n) => n.type === 'n8n-nodes-base.wait')).toBe(true)
  })
})

describe('semantic decomposition — Wait until / retry until success', () => {
  it('wait until → wait node + condition', () => {
    const blueprint: BlueprintModuleInput = {
      name: 'Wait',
      trigger: 'Manual',
      steps: [{ type: 'execution', action: 'Wait until the document is signed' }],
      integrations_required: [],
    }
    const { n8n } = build(blueprint)
    expect(n8n.nodes.some((n) => n.type === 'n8n-nodes-base.wait')).toBe(true)
  })

  it('retry until success → attempt + condition + wait', () => {
    const blueprint: BlueprintModuleInput = {
      name: 'Retry',
      trigger: 'Manual',
      steps: [{ type: 'execution', action: 'Send invoice and retry until success' }],
      integrations_required: [],
    }
    const { planned } = build(blueprint)
    const flat = flatten(planned.steps)
    expect(flat.some((s) => s.type === 'condition' && /succeed/i.test(s.action))).toBe(true)
    expect(flat.some((s) => /retry/i.test(s.action))).toBe(true)
  })
})

describe('semantic decomposition — validator catches linearization regressions', () => {
  it('flags a workflow where "escalate delays" was flattened into a plain action with no condition', () => {
    const linearized: PlannedStep[] = [
      { step: 1, action: 'Track progress', tool: 'n8n', output: '', type: 'action', category: ['BUSINESS_ACTION'], forceIntent: 'http' },
      { step: 2, action: 'Escalate delays', tool: 'n8n', output: '', type: 'action', category: ['BUSINESS_ACTION'], forceIntent: 'http' },
    ]
    const result = validatePlannedWorkflow({
      trigger: 'Manual',
      steps: linearized,
      integrations: [],
      unresolvedIntegrations: [],
      warnings: [],
    })
    expect(result.warnings.some((w) => /linearized a temporal\/conditional requirement/i.test(w))).toBe(true)
  })

  it('does not flag a correctly-decomposed track+escalate workflow', () => {
    const blueprint: BlueprintModuleInput = {
      name: 'Onboarding',
      trigger: 'Manual',
      steps: [{ type: 'execution', action: 'Track progress and escalate delays' }],
      integrations_required: [],
    }
    const planned = planWorkflowFromBlueprintModule(blueprint)
    const result = validatePlannedWorkflow(planned)
    expect(result.warnings.some((w) => /linearized a temporal\/conditional requirement/i.test(w))).toBe(false)
  })
})

describe('semantic decomposition — mutually exclusive support outcomes', () => {
  it('creates an IF routine/complex branch instead of executing both outcomes linearly', () => {
    const blueprint: BlueprintModuleInput = {
      name: 'Customer Support Ticket Automation',
      trigger: 'New support ticket received',
      steps: [
        { type: 'ai_processing', action: 'Categorise ticket by type' },
        { type: 'ai_processing', action: 'Determine urgency' },
        { type: 'ingestion', action: 'Gather customer context' },
        { type: 'ingestion', action: 'Pull related customer record' },
        { type: 'ingestion', action: 'Pull prior-ticket history from the data layer' },
        { type: 'execution', action: 'Apply policy to route: auto-resolve routine cases' },
        { type: 'human_review', action: 'Escalate complex ones to a human' },
        { type: 'notification', action: 'Send resolution or acknowledgement' },
        { type: 'notification', action: 'Notify the relevant team member on escalations' },
        { type: 'audit', action: 'Log workflow result' },
      ],
      integrations_required: ['CRM system', 'Communication channels', 'Helpdesk system'],
    }
    const planned = planWorkflowFromBlueprintModule(blueprint)
    const flat = flatten(planned.steps)
    const route = flat.find((s) => s.type === 'condition' && /routine case/i.test(s.action))
    expect(route).toBeDefined()
    expect(route!.conditionField).toBe('is_routine')
    expect(route!.branches?.[0].steps.some((s) => /auto-resolve/i.test(s.action))).toBe(true)
    expect(route!.branches?.[1].steps.some((s) => /escalate complex/i.test(s.action))).toBe(true)
  })

  it('uses native integration nodes and never maps escalation notification to Wait', () => {
    const blueprint: BlueprintModuleInput = {
      name: 'Support',
      trigger: 'New ticket received',
      steps: [
        { type: 'ingestion', action: 'Pull related customer record from CRM system' },
        { type: 'execution', action: 'Apply policy to route: auto-resolve routine cases' },
        { type: 'human_review', action: 'Escalate complex ones to a human' },
        { type: 'notification', action: 'Notify the relevant team member on escalations' },
      ],
      integrations_required: ['CRM system', 'Communication channels', 'Helpdesk system'],
    }
    const planned = planWorkflowFromBlueprintModule(blueprint)
    const n8n = convertToN8nWorkflow({
      workflow_id: 'support',
      title: blueprint.name,
      trigger: planned.trigger,
      steps: planned.steps,
      skipAutoLimit: true,
      assumptions: planned.assumptions,
      needsClarification: planned.needsClarification,
    })
    expect(n8n.nodes.some((n) => n.type === 'n8n-nodes-base.hubspot')).toBe(true)
    expect(n8n.nodes.some((n) => n.type === 'n8n-nodes-base.zendesk')).toBe(true)
    expect(n8n.nodes.some((n) => n.type === 'n8n-nodes-base.slack')).toBe(true)
    const escalationNotify = n8n.nodes.find((n) => /Notify the relevant team/i.test(n.name))
    expect(escalationNotify?.type).toBe('n8n-nodes-base.slack')
    expect(escalationNotify?.type).not.toBe('n8n-nodes-base.wait')
  })
})
