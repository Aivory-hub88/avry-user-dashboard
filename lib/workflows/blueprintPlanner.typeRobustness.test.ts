/**
 * Regression suite for a bug found against LIVE generated workflows (user-
 * supplied screenshots of two blueprints), distinct from and deeper than
 * the graph-semantics bugs in blueprintPlanner.graphSemantics.test.ts.
 *
 * Root cause: every branch/exception-detection gate in this file (the basic
 * exception gate, the routine/complex outcome-pair, the approval-outcome
 * flow) was keyed EXCLUSIVELY on the blueprint's own `step.type` field
 * matching an exact value ('human_review', or an 'execution'+'human_review'
 * pair). That `type` is assigned by a SEPARATE, upstream LLM call
 * (lib/blueprintGeneration.ts) with only light guidance — it is a real but
 * unreliable signal. "Escalate complex ones to a human" and "Approve
 * exceptions" both read just as naturally as an ordinary `execution` step
 * to that model as a `human_review` one, and empirically often get typed
 * that way. When the upstream label didn't match, ALL of this file's
 * sophisticated branch-detection was skipped entirely and the step fell
 * through to a flat, unbranched action node — reproduced live: an 8-step
 * "Customer Onboarding Automation" and a 10-step support-ticket-triage
 * blueprint both generated as a single linear HTTP-request chain with zero
 * IF/switch nodes, despite both blueprints explicitly describing a
 * decision/exception point ("approve exceptions", "escalate complex ones
 * to a human").
 *
 * Fix: isHumanReviewLike() in blueprintPlanner.ts checks the step's TEXT
 * first (reusing the same bilingual keyword signal classifyStepCategories()
 * already uses for category tagging), with `type === 'human_review'` only
 * as a fallback/corroborating signal — never a hard gate.
 */
import { describe, it, expect } from 'vitest'
import { planWorkflowFromBlueprintModule, type BlueprintModuleInput, type PlannedStep } from './blueprintPlanner'

function flatten(steps: PlannedStep[]): PlannedStep[] {
  const out: PlannedStep[] = []
  for (const s of steps) {
    out.push(s)
    for (const b of s.branches ?? []) out.push(...flatten(b.steps))
  }
  return out
}

function hasBranching(steps: PlannedStep[]): boolean {
  return steps.some((s) => s.type === 'condition' || s.type === 'switch')
}

describe('regression: upstream step-type misclassification must not flatten the graph', () => {
  // The exact shape of the live "Support Ticket Triage" screenshot — the
  // blueprint-generation LLM typed the escalation step 'execution', not
  // 'human_review'.
  const supportTicketMistyped: BlueprintModuleInput = {
    name: 'Support Ticket Triage',
    trigger: 'New ticket created',
    steps: [
      { type: 'ingestion', action: 'Categorise ticket by type' },
      { type: 'ai_processing', action: 'Determine urgency' },
      { type: 'ingestion', action: 'Get customer context' },
      { type: 'ingestion', action: 'Pull related customer history from the database' },
      { type: 'execution', action: 'Apply policy to route: auto-resolve routine cases' },
      { type: 'execution', action: 'Escalate complex ones to a human' },
      { type: 'notification', action: 'Send resolution or acknowledgement' },
      { type: 'notification', action: 'Notify the relevant team member on escalations' },
    ],
    integrations_required: ['Helpdesk'],
  }

  it('still produces a routine/complex branch even though the escalation step is typed execution', () => {
    const planned = planWorkflowFromBlueprintModule(supportTicketMistyped)
    expect(hasBranching(planned.steps)).toBe(true)
    const flat = flatten(planned.steps)
    expect(flat.some((s) => /escalate complex/i.test(s.action))).toBe(true)
  })

  it('does not produce a bare flat chain (the exact live-reported symptom)', () => {
    const planned = planWorkflowFromBlueprintModule(supportTicketMistyped)
    // Before the fix, every single step here decomposed to a top-level
    // 'action' node with zero condition/switch anywhere in the tree.
    expect(planned.steps.some((s) => s.type === 'condition' || s.type === 'switch')).toBe(true)
  })

  it('the notification step mentioning "escalations" as a noun stays a plain communication step, not a phantom exception gate', () => {
    const planned = planWorkflowFromBlueprintModule(supportTicketMistyped)
    const flat = flatten(planned.steps)
    const notifyStep = flat.find((s) => /notify the relevant team/i.test(s.action))
    expect(notifyStep).toBeDefined()
    expect(notifyStep!.type).toBe('action')
    // Must not have been duplicated into a separate bogus "Data complete?"
    // gate wrapping the SAME text — exactly the false-positive this fix's
    // own text-based widening could have introduced if scoped too broadly.
    const conditionCount = flat.filter((s) => s.type === 'condition').length
    expect(conditionCount).toBeLessThanOrEqual(1)
  })

  // The exact shape of the live "Customer Onboarding Automation" screenshot.
  const onboardingMistyped: BlueprintModuleInput = {
    name: 'Customer Onboarding Automation',
    trigger: 'New signup',
    steps: [
      { type: 'ingestion', action: 'Capture customer details from signup form' },
      { type: 'ai_processing', action: 'Validate' },
      { type: 'ingestion', action: 'Enrich customer data' },
      { type: 'execution', action: 'Create onboarding tasks' },
      { type: 'notification', action: 'Send welcome communications' },
      { type: 'execution', action: 'Review' },
      { type: 'execution', action: 'Approve exceptions' },
    ],
    integrations_required: ['Communication channel'],
  }

  it('"Approve exceptions" typed execution still produces an approval branch', () => {
    const planned = planWorkflowFromBlueprintModule(onboardingMistyped)
    expect(hasBranching(planned.steps)).toBe(true)
  })

  it('"Review" typed execution is folded into the exception/review path, not a bare linear step', () => {
    const planned = planWorkflowFromBlueprintModule(onboardingMistyped)
    const flat = flatten(planned.steps)
    const reviewStep = flat.find((s) => s.action === 'Review')
    expect(reviewStep).toBeDefined()
    // It must be reachable only via SOME branch (i.e. not a top-level step
    // in the unconditional success chain) — found by checking it is NOT in
    // the top-level array.
    expect(planned.steps.includes(reviewStep!)).toBe(false)
  })
})

describe('regression: correctly-typed upstream output is unaffected (no behavior change when type already agrees with text)', () => {
  const correctlyTyped: BlueprintModuleInput = {
    name: 'Support Ticket Triage',
    trigger: 'New ticket created',
    steps: [
      { type: 'ingestion', action: 'Categorise ticket by type' },
      { type: 'ai_processing', action: 'Determine urgency' },
      { type: 'execution', action: 'Apply policy to route: auto-resolve routine cases' },
      { type: 'human_review', action: 'Escalate complex ones to a human' },
    ],
    integrations_required: ['Helpdesk'],
  }

  it('produces identical branching whether the escalation step is typed human_review or (via text) execution', () => {
    const mistyped: BlueprintModuleInput = {
      ...correctlyTyped,
      steps: correctlyTyped.steps.map((s, i) => (i === 3 ? { ...s, type: 'execution' as const } : s)),
    }
    const plannedCorrect = planWorkflowFromBlueprintModule(correctlyTyped)
    const plannedMistyped = planWorkflowFromBlueprintModule(mistyped)
    const fingerprint = (steps: PlannedStep[]) => flatten(steps).map((s) => `${s.type}:${s.forceIntent ?? ''}`).join('|')
    expect(fingerprint(plannedMistyped.steps)).toBe(fingerprint(plannedCorrect.steps))
  })
})

describe('regression: text-based widening must not preempt the more specific Stage 5b semantic patterns', () => {
  it('"Track progress and escalate delays" (contains "escalat") still goes through buildTrackEscalateSemantic, not a bare exception gate', () => {
    const blueprint: BlueprintModuleInput = {
      name: 'Project Tracking',
      trigger: 'New project created',
      steps: [{ type: 'execution', action: 'Track progress and escalate delays' }],
      integrations_required: [],
    }
    const planned = planWorkflowFromBlueprintModule(blueprint)
    const flat = flatten(planned.steps)
    // The Stage 5b pattern's own distinctive nodes must be present —
    // observe/evaluate steps and an is_delayed condition, not a generic
    // "Data complete?" exception gate.
    expect(flat.some((s) => /check current progress status/i.test(s.action))).toBe(true)
    expect(flat.some((s) => s.conditionField === 'is_delayed')).toBe(true)
    expect(flat.some((s) => /^data complete\?/i.test(s.action))).toBe(false)
  })
})
