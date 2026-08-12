/**
 * Blueprint planner — proves the core bug is fixed: a business blueprint no
 * longer translates 1:1 into "Webhook → AI → AI → AI → AI". Covers the 10
 * required scenarios (customer onboarding, lead qualification, invoice
 * processing, support ticket triage, employee onboarding, missing data,
 * human approval, multi-branch routing, CRM+email+calendar, genuine AI
 * reasoning) plus the planner's classify/decompose/validate stages directly.
 */
import { describe, it, expect } from 'vitest'
import {
  classifyStepCategories,
  planWorkflowFromBlueprintModule,
  validatePlannedWorkflow,
  type BlueprintModuleInput,
  type PlannedStep,
} from './blueprintPlanner'
import { detectNodeIntent } from './nodeMapper'

// ── helpers ────────────────────────────────────────────────────────────────

function flatten(steps: PlannedStep[]): PlannedStep[] {
  const out: PlannedStep[] = []
  for (const s of steps) {
    out.push(s)
    for (const b of s.branches ?? []) out.push(...flatten(b.steps))
  }
  return out
}

/** Mirrors workflowConverter.ts's convertSteps(): forceIntent short-circuits
 *  detectNodeIntent() when the planner already knows the category from a
 *  structured source (see PlannedStep.forceIntent's doc comment). */
function resolveIntent(s: PlannedStep): string {
  return s.forceIntent ?? detectNodeIntent(s.action, s.tool)
}

function intents(steps: PlannedStep[]): string[] {
  return flatten(steps)
    .filter((s) => !s.type || s.type === 'action')
    .map(resolveIntent)
}

function countAiNodes(steps: PlannedStep[]): number {
  return intents(steps).filter((i) => i === 'ai').length
}

// ── Stage 2: classification ───────────────────────────────────────────────

describe('classifyStepCategories', () => {
  it('classifies a validate+classify step as AI_REASONING (blueprint type prior)', () => {
    const cats = classifyStepCategories({ type: 'ai_processing', action: 'Memvalidasi kelengkapan data dan mengklasifikasikan jenis layanan yang dibutuhkan' })
    expect(cats).toContain('AI_REASONING')
  })

  it('classifies a multi-part execution step with all its categories', () => {
    const cats = classifyStepCategories({
      type: 'execution',
      action: 'Membuat akun, mengirimkan materi onboarding, dan menjadwalkan sesi pengenalan',
    })
    expect(cats).toContain('BUSINESS_ACTION')
    expect(cats).toContain('COMMUNICATION')
    expect(cats).toContain('SCHEDULING')
  })

  it('classifies a human_review step with incomplete-data wording as EXCEPTION_HANDLING too', () => {
    const cats = classifyStepCategories({
      type: 'human_review',
      action: 'Meninjau kasus luar biasa atau data yang tidak lengkap sebelum diproses lebih lanjut',
    })
    expect(cats).toContain('HUMAN_REVIEW')
    expect(cats).toContain('EXCEPTION_HANDLING')
  })

  it('classifies a decision step as DECISION', () => {
    const cats = classifyStepCategories({ type: 'decision', action: 'Menentukan jalur onboarding berdasarkan profil dan kebutuhan pelanggan' })
    expect(cats).toContain('DECISION')
  })
})

// ── Core regression: no 1-step-= 1-AI-agent ───────────────────────────────

describe('the reported bug — 1 blueprint step must NOT become 1 AI Agent node', () => {
  const onboarding: BlueprintModuleInput = {
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
    integrations_required: ['CRM', 'Customer communication channel', 'Scheduling system'],
  }

  it('produces far more than 6 nodes (real decomposition happened)', () => {
    const planned = planWorkflowFromBlueprintModule(onboarding)
    const all = flatten(planned.steps)
    expect(all.length).toBeGreaterThan(onboarding.steps.length)
  })

  it('does NOT resolve every step to an AI Agent node', () => {
    const planned = planWorkflowFromBlueprintModule(onboarding)
    const all = flatten(planned.steps)
    const aiCount = countAiNodes(planned.steps)
    // Only the genuine-reasoning steps (validate+classify, and the AI prefix
    // for the profile-based routing decision) should resolve to AI — a small
    // minority of the total node count, not "every step".
    expect(aiCount).toBeLessThan(all.length / 2)
    expect(aiCount).toBeGreaterThan(0) // the validate/classify step genuinely needs it
  })

  it('produces deterministic nodes for mechanical actions (create account, send materials, schedule, notify)', () => {
    const planned = planWorkflowFromBlueprintModule(onboarding)
    const flat = flatten(planned.steps).filter((s) => !s.type || s.type === 'action')
    const byIntent = (label: RegExp) => flat.filter((s) => label.test(s.action))

    const createAccount = byIntent(/membuat akun/i)[0]
    expect(createAccount).toBeDefined()
    expect(resolveIntent(createAccount)).not.toBe('ai')

    const sendMaterials = byIntent(/mengirimkan materi/i)[0]
    expect(sendMaterials).toBeDefined()
    expect(resolveIntent(sendMaterials)).not.toBe('ai')

    const schedule = byIntent(/menjadwalkan sesi/i)[0]
    expect(schedule).toBeDefined()
    expect(resolveIntent(schedule)).toBe('calendar')
  })

  it('builds an explicit exception branch instead of a bare trailing linear step', () => {
    const planned = planWorkflowFromBlueprintModule(onboarding)
    const gate = planned.steps.find((s) => s.type === 'condition')
    expect(gate).toBeDefined()
    expect(gate!.branches?.length).toBe(2)
    const exceptionBranch = gate!.branches!.find((b) => b.steps.length > 0)
    expect(exceptionBranch).toBeDefined()
    expect(exceptionBranch!.steps.some((s) => /meninjau|human review/i.test(`${s.action} ${s.tool}`))).toBe(true)
    // The exception branch must not be the LAST thing in the top-level chain
    // with nothing after it structurally impossible to reach — it's reachable
    // as a branch off a real condition node, not appended after the trigger
    // with no gate at all.
    expect(gate!.type).toBe('condition')
  })

  it('validator finds no structural errors and confirms the exception path is reachable', () => {
    const planned = planWorkflowFromBlueprintModule(onboarding)
    const result = validatePlannedWorkflow(planned)
    expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
  })

  it('produces a decision step as a switch/router, not another AI agent', () => {
    const planned = planWorkflowFromBlueprintModule(onboarding)
    const router = planned.steps.find((s) => s.type === 'switch')
    expect(router).toBeDefined()
    expect(router!.branches?.length).toBeGreaterThanOrEqual(2)
  })
})

// ── Scenario 1: customer onboarding (covered above in detail) ────────────
// ── Scenario 2: lead qualification ────────────────────────────────────────

describe('scenario: lead qualification', () => {
  const leadQualification: BlueprintModuleInput = {
    name: 'Lead Qualification',
    trigger: 'New lead submitted via web form',
    steps: [
      { type: 'ingestion', action: 'Get new lead details from the web form' },
      { type: 'ai_processing', action: 'Analyse lead intent and score fit against ideal customer profile' },
      { type: 'decision', action: 'Determine whether the lead is sales-qualified based on score and budget' },
      { type: 'execution', action: 'Create the lead record in HubSpot and assign an owner' },
      { type: 'notification', action: 'Notify the sales rep about the new qualified lead' },
    ],
    integrations_required: ['HubSpot', 'Slack'],
  }

  it('routes through AI reasoning + a router, not one agent per step', () => {
    const planned = planWorkflowFromBlueprintModule(leadQualification)
    const flat = flatten(planned.steps)
    expect(countAiNodes(planned.steps)).toBeLessThan(flat.length)
    expect(planned.steps.some((s) => s.type === 'switch')).toBe(true)
  })

  it('passes validation', () => {
    const planned = planWorkflowFromBlueprintModule(leadQualification)
    expect(validatePlannedWorkflow(planned).valid).toBe(true)
  })
})

// ── Scenario 3: invoice processing ────────────────────────────────────────

describe('scenario: invoice processing', () => {
  const invoiceProcessing: BlueprintModuleInput = {
    name: 'Invoice Processing',
    trigger: 'New invoice received by email',
    steps: [
      { type: 'ingestion', action: 'Get the incoming invoice email and attached PDF' },
      { type: 'ai_processing', action: 'Extract and classify line items from the invoice document' },
      { type: 'decision', action: 'Determine whether the invoice amount is within the auto-approval threshold (more than $5,000 requires approval)' },
      { type: 'execution', action: 'Record the invoice in the accounting system' },
      { type: 'notification', action: 'Notify finance about the processed invoice' },
    ],
    integrations_required: ['Gmail', 'Accounting system'],
  }

  it('a numeric-threshold decision does NOT get an AI-reasoning prefix', () => {
    const planned = planWorkflowFromBlueprintModule(invoiceProcessing)
    // Only the extract/classify step should be AI — the amount-threshold
    // decision is a plain deterministic comparison per the governance rule.
    expect(countAiNodes(planned.steps)).toBe(1)
  })

  it('passes validation', () => {
    const planned = planWorkflowFromBlueprintModule(invoiceProcessing)
    expect(validatePlannedWorkflow(planned).valid).toBe(true)
  })
})

// ── Scenario 4: customer support ticket triage ────────────────────────────

describe('scenario: support ticket triage', () => {
  const ticketTriage: BlueprintModuleInput = {
    name: 'Support Ticket Triage',
    trigger: 'New ticket created in Zendesk',
    steps: [
      { type: 'ingestion', action: 'Get the new ticket details from Zendesk' },
      { type: 'ai_processing', action: 'Classify ticket urgency and topic from the customer message' },
      { type: 'decision', action: 'Determine routing team based on urgency and topic' },
      { type: 'execution', action: 'Assign the ticket to the routed team and update its status' },
      { type: 'human_review', action: 'Escalate exceptional or unclear tickets to a human agent for manual review' },
    ],
    integrations_required: ['Zendesk'],
  }

  it('wraps escalation in an exception gate off the classification step', () => {
    const planned = planWorkflowFromBlueprintModule(ticketTriage)
    const gate = planned.steps.find((s) => s.type === 'condition')
    expect(gate).toBeDefined()
    expect(validatePlannedWorkflow(planned).errors).toEqual([])
  })
})

// ── Scenario 5: employee onboarding ───────────────────────────────────────

describe('scenario: employee onboarding', () => {
  const employeeOnboarding: BlueprintModuleInput = {
    name: 'Employee Onboarding',
    trigger: 'New hire confirmed in HRIS',
    steps: [
      { type: 'ingestion', action: 'Get new hire details from the HRIS system' },
      { type: 'execution', action: 'Create IT accounts, send welcome materials, and schedule orientation session' },
      { type: 'notification', action: 'Notify the hiring manager and the new hire about onboarding status' },
    ],
    integrations_required: ['HRIS', 'Email'],
  }

  it('decomposes the multi-action step into separate account/materials/schedule nodes', () => {
    const planned = planWorkflowFromBlueprintModule(employeeOnboarding)
    const flat = flatten(planned.steps)
    expect(flat.some((s) => /create it accounts/i.test(s.action))).toBe(true)
    expect(flat.some((s) => /send welcome materials/i.test(s.action))).toBe(true)
    expect(flat.some((s) => /schedule orientation session/i.test(s.action))).toBe(true)
    // None of these three should be an AI Agent.
    for (const re of [/create it accounts/i, /send welcome materials/i, /schedule orientation session/i]) {
      const step = flat.find((s) => re.test(s.action))!
      expect(resolveIntent(step)).not.toBe('ai')
    }
  })

  it('has no AI steps at all — this module never needed reasoning', () => {
    const planned = planWorkflowFromBlueprintModule(employeeOnboarding)
    expect(countAiNodes(planned.steps)).toBe(0)
  })
})

// ── Scenario 6: workflow with missing data ────────────────────────────────

describe('scenario: workflow with missing data', () => {
  const missingData: BlueprintModuleInput = {
    name: 'Order Processing',
    trigger: 'New order placed',
    steps: [
      { type: 'ingestion', action: 'Get the new order details' },
      { type: 'ai_processing', action: 'Validate that all required order fields are present' },
      { type: 'human_review', action: 'Review orders with incomplete or missing data before fulfilling them' },
      { type: 'execution', action: 'Fulfill the order' },
    ],
    integrations_required: ['Order system'],
  }

  it('generates a reachable exception branch for the missing-data case', () => {
    const planned = planWorkflowFromBlueprintModule(missingData)
    const result = validatePlannedWorkflow(planned)
    expect(result.errors).toEqual([])
    const gate = planned.steps.find((s) => s.type === 'condition')
    expect(gate?.branches?.some((b) => b.steps.length > 0)).toBe(true)
  })
})

// ── Scenario 7: workflow with human approval ──────────────────────────────

describe('scenario: workflow with human approval', () => {
  const approvalFlow: BlueprintModuleInput = {
    name: 'Expense Approval',
    trigger: 'New expense submitted',
    steps: [
      { type: 'ingestion', action: 'Get the submitted expense details' },
      { type: 'decision', action: 'Determine if the expense amount is more than the $500 threshold' },
      { type: 'human_review', action: 'Require manager approval for expenses that need review' },
      { type: 'execution', action: 'Reimburse the approved expense' },
    ],
    integrations_required: ['Finance system'],
  }

  it('flags the review case and ends the branch on a wait-for-approval node', () => {
    const planned = planWorkflowFromBlueprintModule(approvalFlow)
    const gate = planned.steps.find((s) => s.type === 'condition')
    const exceptionBranch = gate?.branches?.find((b) => b.terminal)
    expect(exceptionBranch).toBeDefined()

    const flagStep = exceptionBranch!.steps.find((s) => /manager approval/i.test(s.action))
    expect(flagStep).toBeDefined()

    // The branch must end on an actual wait/resume node — that's the part
    // of the sequence that genuinely represents "pausing for a human."
    const waitStep = exceptionBranch!.steps[exceptionBranch!.steps.length - 1]
    expect(resolveIntent(waitStep)).toBe('humanReview')
  })

  it('marks the exception branch terminal (does not rejoin the approved-expense path)', () => {
    const planned = planWorkflowFromBlueprintModule(approvalFlow)
    const gate = planned.steps.find((s) => s.type === 'condition')
    expect(gate?.branches?.find((b) => b.terminal)).toBeDefined()
    expect(gate?.branches?.find((b) => !b.terminal)?.steps).toEqual([])
  })
})

// ── Scenario 8: multiple routing branches ─────────────────────────────────

describe('scenario: multiple routing branches', () => {
  const routing: BlueprintModuleInput = {
    name: 'Service Request Routing',
    trigger: 'New service request received',
    steps: [
      { type: 'ingestion', action: 'Get the service request details' },
      { type: 'decision', action: 'Determine which department should handle the request based on category and urgency' },
      { type: 'execution', action: 'Assign the request to the routed department' },
    ],
    integrations_required: [],
  }

  it('builds a real switch node with multiple branches, not a bare AI agent', () => {
    const planned = planWorkflowFromBlueprintModule(routing)
    const router = planned.steps.find((s) => s.type === 'switch')
    expect(router).toBeDefined()
    expect(router!.branches!.length).toBeGreaterThanOrEqual(2)
  })
})

// ── Scenario 9: CRM + email + calendar integration ────────────────────────

describe('scenario: CRM + email + calendar', () => {
  const multiIntegration: BlueprintModuleInput = {
    name: 'Client Kickoff',
    trigger: 'Deal marked as won in CRM',
    steps: [
      { type: 'ingestion', action: 'Get the client record from the CRM' },
      { type: 'execution', action: 'Send a welcome email and schedule a kickoff meeting' },
    ],
    integrations_required: ['CRM', 'Email', 'Calendar'],
  }

  it('resolves distinct node intents for CRM, email, and calendar steps', () => {
    const planned = planWorkflowFromBlueprintModule(multiIntegration)
    const flat = flatten(planned.steps)

    const crmStep = flat.find((s) => /crm/i.test(`${s.action} ${s.tool}`))
    expect(crmStep).toBeDefined()
    expect(resolveIntent(crmStep!)).not.toBe('ai')

    const emailStep = flat.find((s) => /welcome email/i.test(s.action))
    expect(emailStep).toBeDefined()
    expect(resolveIntent(emailStep!)).toBe('email')

    const calendarStep = flat.find((s) => /kickoff meeting/i.test(s.action))
    expect(calendarStep).toBeDefined()
    expect(resolveIntent(calendarStep!)).toBe('calendar')
  })
})

// ── Scenario 10: genuine AI reasoning required ────────────────────────────

describe('scenario: AI reasoning genuinely required', () => {
  const aiHeavy: BlueprintModuleInput = {
    name: 'Content Moderation',
    trigger: 'New user-generated post submitted',
    steps: [
      { type: 'ingestion', action: 'Get the submitted post content' },
      { type: 'ai_processing', action: 'Analyse the post for policy violations and classify severity' },
      { type: 'execution', action: 'Apply the moderation action' },
    ],
    integrations_required: ['Content platform'],
  }

  it('keeps the ai_processing step as a single AI Agent node (correctly, not decomposed)', () => {
    const planned = planWorkflowFromBlueprintModule(aiHeavy)
    const flat = flatten(planned.steps)
    const aiSteps = flat.filter((s) => resolveIntent(s) === 'ai')
    expect(aiSteps.length).toBe(1)
    expect(aiSteps[0].action).toMatch(/policy violations/i)
  })

  it('validator does not flag the genuinely-AI step as ungoverned', () => {
    const planned = planWorkflowFromBlueprintModule(aiHeavy)
    const result = validatePlannedWorkflow(planned)
    expect(result.warnings.some((w) => /without an AI_REASONING classification/.test(w))).toBe(false)
  })
})

// ── Stage 8 validator sanity ───────────────────────────────────────────────

describe('validatePlannedWorkflow', () => {
  it('flags a workflow with no trigger', () => {
    const planned = planWorkflowFromBlueprintModule({
      name: 'Empty',
      trigger: '',
      steps: [{ type: 'execution', action: 'Do something' }],
      integrations_required: [],
    })
    planned.trigger = ''
    const result = validatePlannedWorkflow(planned)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => /no trigger/i.test(e))).toBe(true)
  })

  it('flags a malformed switch step with fewer than 2 branches', () => {
    const result = validatePlannedWorkflow({
      trigger: 'Manual',
      integrations: [],
      unresolvedIntegrations: [],
      warnings: [],
      steps: [{ step: 1, action: 'Route', tool: 'Router', output: '', type: 'switch', branches: [{ key: 'a', steps: [] }] }],
    })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => /switch node needs at least 2 branches/i.test(e))).toBe(true)
  })
})
