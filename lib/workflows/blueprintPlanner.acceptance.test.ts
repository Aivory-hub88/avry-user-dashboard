/**
 * Blueprint → n8n acceptance regression suite.
 *
 * Covers the "Customer Onboarding Automation" acceptance criteria and the two
 * structural guarantees (Fix 6 determinism, Fix 8 deterministic routing):
 *   - no placeholder URLs shipped as active (active:false + requiresConfiguration)
 *   - no empty Set nodes
 *   - IF conditions fed by upstream nodes (is_delayed set by the SLA node)
 *   - no truncated node names
 *   - exception/recovery branch on the validate step
 *   - deterministic actions never routed through an LLM/Chat Model node
 *   - identical structure across N runs
 */
import { describe, it, expect } from 'vitest'
import { planWorkflowFromBlueprintModule, validatePlannedWorkflow } from './blueprintPlanner'
import { convertToN8nWorkflow } from '../workflowConverter'

const ONBOARDING = {
  workflow_id: 'wf',
  name: 'Customer Onboarding Automation',
  trigger: 'New customer sign-up or onboarding request received.',
  steps: [
    { type: 'ai_processing', action: 'Validate customer information from sign-up form' },
    { type: 'execution', action: 'Create onboarding checklist based on service type' },
    { type: 'execution', action: 'Assign tasks to relevant team members' },
    { type: 'execution', action: 'Track progress and escalate delays' },
  ],
  integrations_required: ['CRM system', 'Communication channels', 'Helpdesk system'],
} as const

function generate() {
  const planned = planWorkflowFromBlueprintModule(ONBOARDING as any)
  const n8n = convertToN8nWorkflow({
    workflow_id: 'wf',
    title: ONBOARDING.name,
    trigger: planned.trigger,
    steps: planned.steps,
    skipAutoLimit: true,
    assumptions: planned.assumptions,
    needsClarification: planned.needsClarification,
  })
  return { planned, n8n }
}

describe('acceptance: Customer Onboarding Automation', () => {
  it('generic integration categories resolve to default platforms with labelled assumptions', () => {
    const { planned } = generate()
    expect(planned.assumptions).toContain('CRM system → HubSpot')
    expect(planned.assumptions).toContain('Communication channels → Slack')
    expect(planned.assumptions).toContain('Helpdesk system → Zendesk')
    expect(planned.needsClarification).toEqual([])
  })

  it('placeholder URLs never ship as active: workflow is active:false with requiresConfiguration', () => {
    const { n8n } = generate()
    const placeholders = n8n.nodes.filter((n: any) =>
      /example\.com\/endpoint|UNRESOLVED_INTEGRATION/i.test(String(n.parameters?.url ?? '')))
    expect(placeholders.length).toBeGreaterThan(0) // still present, but…
    expect((n8n as any).active).toBe(false)
    expect((n8n as any).meta?.requiresConfiguration).toBe(true)
    expect((n8n as any).meta?.assumptions).toEqual(expect.arrayContaining(['CRM system → HubSpot']))
  })

  it('no Set node is generated empty', () => {
    const { n8n } = generate()
    const emptySets = n8n.nodes.filter((n: any) =>
      n.type === 'n8n-nodes-base.set' &&
      (!n.parameters?.assignments?.assignments || n.parameters.assignments.assignments.length === 0))
    expect(emptySets).toEqual([])
  })

  it('the is_delayed IF condition is fed by the upstream SLA/Set node', () => {
    const { n8n } = generate()
    const deadline = n8n.nodes.find((n: any) => /check deadline/i.test(n.name))!
    const assignmentNames = (deadline.parameters as any)?.assignments?.assignments?.map((a: any) => a.name)
    expect(assignmentNames).toContain('is_delayed')
  })

  it('no node name is truncated mid-word', () => {
    const { n8n } = generate()
    // The old bug produced '…from sign-' / '…on servi'. Full names must be kept.
    expect(n8n.nodes.some((n: any) => n.name.includes('from sign-up form'))).toBe(true)
    expect(n8n.nodes.some((n: any) => /sign-\s*$/.test(n.name))).toBe(false)
  })

  it('the validate step has a recovery branch (Data complete? → request → wait)', () => {
    const { n8n } = generate()
    expect(n8n.nodes.some((n: any) => n.type === 'n8n-nodes-base.if' && /Data complete/i.test(n.name))).toBe(true)
    expect(n8n.nodes.some((n: any) => n.type === 'n8n-nodes-base.wait')).toBe(true)
  })

  it('deterministic CRUD actions never route through an LLM/Chat Model node', () => {
    const { n8n } = generate()
    const agents = n8n.nodes.filter((n: any) => n.type === '@n8n/n8n-nodes-langchain.agent')
    // Only the semantic-validation step (a judgment call) may be an agent.
    expect(agents.length).toBe(1)
    expect(agents[0].name).toMatch(/validate customer information/i)
    // No deterministic create/assign/escalate step is an agent.
    for (const label of ['Create onboarding', 'Assign tasks', 'Escalate']) {
      expect(agents.some((n: any) => n.name.includes(label))).toBe(false)
    }
  })

  it('produces identical structure across 3 consecutive runs (Fix 6 determinism)', () => {
    const fingerprints = new Set<string>()
    for (let i = 0; i < 3; i++) {
      const { n8n } = generate()
      fingerprints.add(n8n.nodes.map((n: any) => n.type).join('|'))
    }
    expect(fingerprints.size).toBe(1)
  })

  it('passes the planner validator cleanly', () => {
    const { planned } = generate()
    const result = validatePlannedWorkflow(planned)
    expect(result.errors).toEqual([])
  })
})
