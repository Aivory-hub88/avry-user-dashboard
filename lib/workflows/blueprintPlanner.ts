/**
 * Blueprint → executable-workflow planner.
 *
 * A BlueprintV1WorkflowModule step describes BUSINESS intent ("validate
 * customer data and classify the service needed"), not technical execution.
 * This module is the "AI Workflow Architect" layer that sits between the
 * blueprint and lib/workflowConverter.ts's graph builder:
 *
 *   Blueprint step → classify → decompose → select node type → build graph
 *   (Stage 2)         (Stage 2)  (Stage 3)    (Stage 4)          (Stage 5)
 *
 * plus explicit exception-branch handling (Stage 6), integration resolution
 * (Stage 7) and a structural validator (Stage 8).
 *
 * CORE PRINCIPLE: 1 blueprint step is NEVER assumed to be 1 workflow node.
 * A step is decomposed into as many atomic operations as it actually
 * describes, and AI is only selected when a step's category genuinely
 * requires reasoning/interpretation (AI_REASONING) — everything else routes
 * through a deterministic node via nodeMapper.ts's detectNodeIntent(), whose
 * own default was changed (see nodeMapper.ts) from "unknown → ai" to
 * "unknown → generic http action", so this planner never has to fight the
 * shared classifier's old AI-by-default behavior.
 *
 * Output shape matches lib/workflowConverter.ts's `WorkflowStep` (duplicated
 * here rather than imported to avoid a circular dependency — that module
 * imports from nodeMapper.ts, and this one is a peer, not a dependent, of
 * workflowConverter.ts). The API route (app/api/console/workflows/
 * from-blueprint/route.ts) is the only caller.
 */

import { detectNodeIntent } from './nodeMapper'
import type { NodeIntent } from './nodeMapper'

// ── Stage 2: business-intent categories ──────────────────────────────────────

export type StepCategory =
  | 'DATA_RETRIEVAL'
  | 'DATA_TRANSFORMATION'
  | 'AI_REASONING'
  | 'DECISION'
  | 'BUSINESS_ACTION'
  | 'COMMUNICATION'
  | 'SCHEDULING'
  | 'HUMAN_REVIEW'
  | 'EXCEPTION_HANDLING'
  | 'AUDIT'

export type BlueprintStepType =
  | 'ingestion'
  | 'ai_processing'
  | 'decision'
  | 'execution'
  | 'notification'
  | 'human_review'

export interface BlueprintStepInput {
  type: BlueprintStepType
  action: string
}

export interface BlueprintModuleInput {
  workflow_id?: string
  name: string
  trigger: string
  steps: BlueprintStepInput[]
  integrations_required: string[]
}

export interface PlannedStepBranch {
  key: string
  label?: string
  steps: PlannedStep[]
}

/** Output shape — matches lib/workflowConverter.ts's WorkflowStep. */
export interface PlannedStep {
  step: number
  action: string
  tool: string
  output: string
  type?: 'action' | 'condition' | 'switch'
  branches?: PlannedStepBranch[]
  /** Planning metadata — not consumed by the graph builder, kept for the
   *  validator and for tests/debugging (which categories drove this node). */
  category?: StepCategory[]
  /** Which original blueprint step (0-based) this node was decomposed from. */
  sourceStepIndex?: number
  /** Passed straight through to workflowConverter.ts's WorkflowStep — see
   *  its doc comment. Set whenever the category is already authoritative
   *  (AI_REASONING, HUMAN_REVIEW, AUDIT, SCHEDULING) so a text-pattern
   *  collision (e.g. "extract" matching the deterministic `transform`
   *  pattern even though the step is really an AI extraction task) can
   *  never silently override a category the blueprint already told us. */
  forceIntent?: NodeIntent
  /** Stage 7 flag — true when this step needed an integration but neither a
   *  declared one nor a recognizable built-in channel was matched. Set at
   *  construction time (isUnresolvedIntegration()) rather than re-derived
   *  later from `tool` text, which would be lossy: `tool` can legitimately
   *  hold a neutral placeholder ('n8n') that looks unresolved even when it
   *  isn't (e.g. an audit step), or vice versa. */
  unresolvedIntegration?: boolean
}

export interface PlannedWorkflow {
  trigger: string
  steps: PlannedStep[]
  integrations: string[]
  unresolvedIntegrations: string[]
  warnings: string[]
}

// ── Bilingual (EN + Indonesian) keyword tables ────────────────────────────────
// Deliberately narrower/more specific than nodeMapper.ts's node-type patterns
// — these decide business CATEGORY, not n8n node type.

const AI_REASONING_KEYWORDS = /validasi|memvalidasi|klasifikasi|mengklasifikasikan|menilai\b|interpretasi|analisa|menganalisis|validate|classify|classification|analyse|analyze|assess\b|interpret|summarise|summarize|reasoning|understand\b/i
const DECISION_KEYWORDS = /menentukan|tentukan\b|\bjalur\b|\brute\b|determine\b|decide\b|\brout(e|ing)\b|which (path|route)/i
const NUMERIC_DECISION_KEYWORDS = /\b(more than|less than|greater than|kurang dari|lebih dari|di atas|di bawah|threshold|batas|equals?\b|sama dengan|status\s*=)/i
const COMMUNICATION_KEYWORDS = /kirim|mengirim|mengirimkan|memberitahukan|beri ?tahu|kabari|notify|notification|send\b|email|slack|whatsapp|telegram|\bsms\b|pesan\b|message\b|inform\b/i
const SCHEDULING_KEYWORDS = /jadwal|menjadwalkan|penjadwalan|schedule\b|book\b|calendar|kalender|appointment|\bsesi\b|meeting\b/i
const HUMAN_REVIEW_KEYWORDS = /tinjau|meninjau|peninjauan|review\b|approv|persetujuan|escalat/i
const EXCEPTION_KEYWORDS = /luar biasa|khusus\b|tidak lengkap|incomplete\b|exceptional\b|exception\b|missing data|data.*kurang|failed validation|gagal validasi/i
const AUDIT_KEYWORDS = /\baudit\b|\blogging\b|audit trail|catat riwayat|rekam (hasil|log)/i
const FORM_SOURCE_KEYWORDS = /\bform(ulir)?\b|pendaftaran|registration|application\b|permohonan|sign.?up/i

const CATEGORY_BY_BLUEPRINT_TYPE: Record<BlueprintStepType, StepCategory> = {
  ingestion: 'DATA_RETRIEVAL',
  ai_processing: 'AI_REASONING',
  decision: 'DECISION',
  execution: 'BUSINESS_ACTION',
  notification: 'COMMUNICATION',
  human_review: 'HUMAN_REVIEW',
}

/**
 * Stage 2 — classify a blueprint step's business intent. The blueprint's own
 * `type` is a strong prior; keyword scanning layers on additional categories
 * a single step can also carry (e.g. an `execution` step that both creates a
 * record AND sends a notification AND books a session).
 */
export function classifyStepCategories(step: BlueprintStepInput): StepCategory[] {
  const categories = new Set<StepCategory>([CATEGORY_BY_BLUEPRINT_TYPE[step.type] ?? 'BUSINESS_ACTION'])
  const text = step.action || ''

  if (AI_REASONING_KEYWORDS.test(text)) categories.add('AI_REASONING')
  if (DECISION_KEYWORDS.test(text)) categories.add('DECISION')
  if (COMMUNICATION_KEYWORDS.test(text)) categories.add('COMMUNICATION')
  if (SCHEDULING_KEYWORDS.test(text)) categories.add('SCHEDULING')
  if (HUMAN_REVIEW_KEYWORDS.test(text)) categories.add('HUMAN_REVIEW')
  if (AUDIT_KEYWORDS.test(text)) categories.add('AUDIT')
  if (EXCEPTION_KEYWORDS.test(text) || (step.type === 'human_review' && /tidak lengkap|incomplete/i.test(text))) {
    categories.add('EXCEPTION_HANDLING')
  }

  return Array.from(categories)
}

// ── Stage 3: decomposition ────────────────────────────────────────────────────

interface AtomicOp {
  action: string
  categories: StepCategory[]
  sourceStepIndex: number
  /** Resolved integration/channel label, when known — becomes `tool`. */
  integration?: string
  isMerge?: boolean
}

// Splits an imperative list ("create account, send materials, and schedule
// session") into individual actions. Bilingual connectors: dan/and/serta/
// kemudian/then/lalu, plus bare commas.
const CONNECTOR_SPLIT = /\s*,\s*(?:dan\s+|and\s+)?|\s+dan\s+|\s+and\s+|\s+serta\s+|\s+kemudian\s+|\s+then\s+|\s+lalu\s+/i

// A single adversarial/malformed step packed with dozens of connectors
// ("A, B, C, ..., Z") must not blow up node count past what
// MAX_BLUEPRINT_STEPS bounds at the INPUT level — this caps it per step at
// the decomposition stage instead.
const MAX_ATOMIC_OPS_PER_STEP = 12

function splitAtomicActions(action: string): { parts: string[]; truncated: boolean } {
  const parts = action.split(CONNECTOR_SPLIT).map((s) => s.trim()).filter(Boolean)
  const safe = parts.length > 0 ? parts : [action.trim()]
  if (safe.length > MAX_ATOMIC_OPS_PER_STEP) {
    return { parts: safe.slice(0, MAX_ATOMIC_OPS_PER_STEP), truncated: true }
  }
  return { parts: safe, truncated: false }
}

/** Case-insensitive substring match of `label` inside `text`. */
function textMentions(text: string, label: string): boolean {
  return label.length > 0 && text.toLowerCase().includes(label.toLowerCase())
}

/**
 * Ingestion steps often name more than one source ("from the registration
 * form and the CRM system"). Decompose by which declared integrations (plus
 * the implicit "registration form" pseudo-source) are actually referenced,
 * rather than blindly splitting on connector words — connector splitting
 * would break on noun-phrase conjunctions like "profile and needs".
 */
function decomposeIngestion(
  step: BlueprintStepInput,
  sourceStepIndex: number,
  integrations: string[],
  warnings: string[],
): AtomicOp[] {
  const text = step.action
  const matchedIntegrations = integrations.filter((i) => textMentions(text, i))
  const hasFormSource = FORM_SOURCE_KEYWORDS.test(text)

  let sources: { label: string; isForm?: boolean }[] = []
  if (hasFormSource) sources.push({ label: 'Registration Form', isForm: true })
  for (const integ of matchedIntegrations) sources.push({ label: integ })

  if (sources.length > MAX_ATOMIC_OPS_PER_STEP) {
    warnings.push(`Step "${text.slice(0, 60)}...": ${sources.length} sources named — capped to ${MAX_ATOMIC_OPS_PER_STEP}.`)
    sources = sources.slice(0, MAX_ATOMIC_OPS_PER_STEP)
  }

  if (sources.length <= 1) {
    return [{
      action: text,
      categories: ['DATA_RETRIEVAL'],
      sourceStepIndex,
      integration: sources[0]?.label,
    }]
  }

  // Multiple sources named — one retrieval node per source, chained, then a
  // merge/combine node. The graph builder is a single linear chain (no
  // fan-in), so this is sequential retrieval + combine rather than a true
  // parallel-branch merge — an honest approximation given that constraint.
  const ops: AtomicOp[] = sources.map((s) => ({
    action: `Get data from ${s.label}`,
    categories: ['DATA_RETRIEVAL'],
    sourceStepIndex,
    integration: s.label,
  }))
  ops.push({
    action: 'Merge records',
    categories: ['DATA_TRANSFORMATION'],
    sourceStepIndex,
    isMerge: true,
  })
  return ops
}

/** Execution/notification steps: split into one atomic op per imperative
 *  action, each re-classified individually (a "create + notify + schedule"
 *  step is BUSINESS_ACTION + COMMUNICATION + SCHEDULING, in that order). */
function decomposeActionList(
  step: BlueprintStepInput,
  sourceStepIndex: number,
  integrations: string[],
  warnings: string[],
): AtomicOp[] {
  const { parts, truncated } = splitAtomicActions(step.action)
  if (truncated) {
    warnings.push(`Step "${step.action.slice(0, 60)}...": too many actions in one step — capped to ${MAX_ATOMIC_OPS_PER_STEP}.`)
  }
  return parts.map((part) => {
    const categories = new Set<StepCategory>()
    if (COMMUNICATION_KEYWORDS.test(part)) categories.add('COMMUNICATION')
    if (SCHEDULING_KEYWORDS.test(part)) categories.add('SCHEDULING')
    if (categories.size === 0) categories.add(CATEGORY_BY_BLUEPRINT_TYPE[step.type] ?? 'BUSINESS_ACTION')
    const integration = integrations.find((i) => textMentions(part, i))
    return { action: part, categories: Array.from(categories), sourceStepIndex, integration }
  })
}

/** ai_processing steps stay a single reasoning op — validating and
 *  classifying in one pass is exactly the case where an AI Agent node is
 *  appropriate, not something to split further. */
function decomposeAiProcessing(step: BlueprintStepInput, sourceStepIndex: number): AtomicOp[] {
  return [{ action: step.action, categories: ['AI_REASONING'], sourceStepIndex }]
}

function decomposeHumanReview(step: BlueprintStepInput, sourceStepIndex: number): AtomicOp[] {
  const categories: StepCategory[] = ['HUMAN_REVIEW']
  if (EXCEPTION_KEYWORDS.test(step.action)) categories.push('EXCEPTION_HANDLING')
  return [{ action: step.action, categories, sourceStepIndex }]
}

function decomposeStep(
  step: BlueprintStepInput,
  sourceStepIndex: number,
  integrations: string[],
  warnings: string[],
): AtomicOp[] {
  switch (step.type) {
    case 'ingestion':
      return decomposeIngestion(step, sourceStepIndex, integrations, warnings)
    case 'ai_processing':
      return decomposeAiProcessing(step, sourceStepIndex)
    case 'human_review':
      return decomposeHumanReview(step, sourceStepIndex)
    case 'execution':
    case 'notification':
      return decomposeActionList(step, sourceStepIndex, integrations, warnings)
    case 'decision':
      // Decision steps are handled specially by the orchestrator (Stage 5) —
      // they produce an AI-reasoning op + a switch/condition marker, not a
      // plain atomic-op list.
      return [{ action: step.action, categories: ['DECISION'], sourceStepIndex }]
    default:
      return [{ action: step.action, categories: ['BUSINESS_ACTION'], sourceStepIndex }]
  }
}

// ── Stage 4: node-intent selection (tool label) ───────────────────────────────
// The planner does not itself pick an n8n node type — that stays centralized
// in nodeMapper.ts's detectNodeIntent(), the single source of truth for
// action-text → n8n node. The planner's job is to hand it well-labeled,
// already-decomposed atomic ops (via `action` + `tool`) so that classifier
// resolves correctly instead of falling through to a generic default.

/** Deterministic `tool` label for an atomic op — steers detectNodeIntent()
 *  toward the right node without needing it to re-derive category from raw
 *  blueprint prose. Reliable sentinels: 'Aivory AI' (contains "AI"),
 *  'Human Review' (verbatim phrase match), 'Calendar' (verbatim). */
function toolForOp(op: AtomicOp, integrationsRequired: string[]): string {
  if (op.categories.includes('HUMAN_REVIEW')) return 'Human Review'
  if (op.categories.includes('AI_REASONING') && !op.categories.includes('BUSINESS_ACTION')) return 'Aivory AI'
  if (op.categories.includes('AUDIT')) return 'Audit Log'
  if (op.categories.includes('SCHEDULING')) return 'Calendar'
  if (op.integration) return op.integration
  if (op.categories.includes('COMMUNICATION')) {
    return integrationsRequired.find((i) => /slack|mail|whatsapp|telegram|sms/i.test(i)) || 'Notification channel'
  }
  // No specific match — Stage 7 says NOT to hallucinate an integration by
  // guessing one of the declared ones just because it's first in the list;
  // 'n8n' is a neutral placeholder the user configures explicitly. See
  // isUnresolvedIntegration(), which is what actually flags this to the caller.
  return 'n8n'
}

/**
 * When a category is already authoritative (came from the blueprint's own
 * step `type`, not guessed from text), force the node-graph builder to use
 * it directly instead of re-deriving intent from free text — see
 * PlannedStep.forceIntent's doc comment for why that re-derivation is lossy.
 * Returns undefined for ops whose category set doesn't pin down one
 * specific intent (business action / data retrieval / plain communication),
 * which stay text-classified since that's genuinely more precise there
 * (distinguishing email vs. Slack vs. generic HTTP, for example).
 */
function forceIntentForOp(op: AtomicOp): NodeIntent | undefined {
  if (op.categories.includes('HUMAN_REVIEW')) return 'humanReview'
  if (op.categories.includes('AI_REASONING') && !op.categories.includes('BUSINESS_ACTION')) return 'ai'
  if (op.categories.includes('AUDIT')) return 'audit'
  if (op.categories.includes('SCHEDULING')) return 'calendar'
  if (op.isMerge) return 'transform'
  return undefined
}

// ── Stage 7: integration resolution ───────────────────────────────────────────

const BUILTIN_CHANNEL_KEYWORDS = /email|mail\b|slack|whatsapp|telegram|\bsms\b|gmail|calendar|kalender/i

/** A step "needs" an integration when its category implies talking to an
 *  external system. Returns true when neither a declared integration nor a
 *  recognizable built-in channel was matched — i.e. Stage 7's "unresolved
 *  integration, expose it rather than hallucinate a node" case. */
function isUnresolvedIntegration(op: AtomicOp): boolean {
  const needsIntegration = op.categories.some((c) =>
    c === 'DATA_RETRIEVAL' || c === 'BUSINESS_ACTION' || c === 'COMMUNICATION')
  if (!needsIntegration) return false
  if (op.integration) return false
  if (op.isMerge) return false
  if (BUILTIN_CHANNEL_KEYWORDS.test(op.action)) return false
  return true
}

// ── Stage 5/6: graph assembly with exception branches ─────────────────────────

function opToPlannedStep(op: AtomicOp, stepNumber: number, integrationsRequired: string[]): PlannedStep {
  return {
    step: stepNumber,
    action: op.action,
    tool: toolForOp(op, integrationsRequired),
    output: '',
    type: 'action',
    category: op.categories,
    sourceStepIndex: op.sourceStepIndex,
    forceIntent: forceIntentForOp(op),
    unresolvedIntegration: isUnresolvedIntegration(op) || undefined,
  }
}

/** Whether a decision step's routing genuinely needs AI interpretation
 *  (open-ended business criteria) vs. a plain deterministic comparison. */
function decisionNeedsAiReasoning(action: string): boolean {
  if (NUMERIC_DECISION_KEYWORDS.test(action)) return false
  return true
}

interface BuildContext {
  integrationsRequired: string[]
  warnings: string[]
  stepCounter: { n: number }
}

function nextNum(ctx: BuildContext): number {
  ctx.stepCounter.n += 1
  return ctx.stepCounter.n
}

/** Build the [maybe AI] + condition/switch node pair for a `decision` step. */
function buildDecisionNodes(step: BlueprintStepInput, sourceStepIndex: number, ctx: BuildContext): PlannedStep[] {
  const out: PlannedStep[] = []
  const usesAiPrefix = decisionNeedsAiReasoning(step.action)
  if (usesAiPrefix) {
    out.push(opToPlannedStep(
      { action: step.action, categories: ['AI_REASONING', 'DECISION'], sourceStepIndex },
      nextNum(ctx),
      ctx.integrationsRequired,
    ))
  }
  out.push({
    step: nextNum(ctx),
    // Distinct label from the AI-reasoning node above (when both are
    // present) so the canvas doesn't show two adjacent nodes with the exact
    // same title — the switch implements the routing the AI step decided.
    action: usesAiPrefix ? `Route: ${step.action}` : step.action,
    tool: 'Router',
    output: '',
    type: 'switch',
    category: ['DECISION'],
    sourceStepIndex,
    // Two generic placeholder routes — the blueprint doesn't name concrete
    // route values, so branches are left empty (no-op outputs the graph
    // builder already supports); the user fills in real rules/branch bodies
    // in the inspector. Downstream steps resume from the shared join, same
    // as every other branching step.
    branches: [
      { key: 'route_a', label: 'Route A', steps: [] },
      { key: 'route_b', label: 'Route B', steps: [] },
    ],
  })
  return out
}

/** Build the completeness-gate condition wrapping one or more human_review
 *  steps into an explicit NO-branch, per Stage 6 — never a bare trailing
 *  linear step. `gateLabel` names what's being checked (e.g. the preceding
 *  AI validation step's action) for a clearer node label. */
function buildExceptionGate(
  reviewOps: AtomicOp[],
  gateLabel: string,
  sourceStepIndex: number,
  ctx: BuildContext,
): PlannedStep {
  const reviewSteps: PlannedStep[] = reviewOps.map((op) => opToPlannedStep(op, nextNum(ctx), ctx.integrationsRequired))
  reviewSteps.push({
    step: nextNum(ctx),
    action: 'Notify requester about missing or incomplete data',
    tool: 'Notification channel',
    output: '',
    type: 'action',
    category: ['COMMUNICATION', 'EXCEPTION_HANDLING'],
    sourceStepIndex,
  })

  return {
    step: nextNum(ctx),
    action: `Data complete? (${gateLabel})`,
    tool: 'Condition',
    output: '',
    type: 'condition',
    category: ['DECISION', 'EXCEPTION_HANDLING'],
    sourceStepIndex,
    branches: [
      { key: 'incomplete', label: 'Incomplete / Exception', steps: reviewSteps },
      { key: 'complete', label: 'Complete', steps: [] },
    ],
  }
}

/**
 * Stage 1 + 5 + 6 orchestrator — walks the blueprint module's steps in
 * order, decomposing each into one or more PlannedStep nodes, and routes
 * `human_review` steps into an explicit exception branch off the nearest
 * preceding `ai_processing`/`decision` step (falling back to a generic
 * completeness gate if no natural validation step precedes it).
 */
function buildPlannedSteps(module: BlueprintModuleInput, ctx: BuildContext): PlannedStep[] {
  const steps = module.steps
  const reviewIndices = steps.map((s, i) => (s.type === 'human_review' ? i : -1)).filter((i) => i >= 0)
  // Nearest ai_processing step BEFORE the first review step, if any — the
  // completeness/exception check belongs right after the step that actually
  // validated the data, not after a routing decision that may sit closer in
  // the list but runs on the ASSUMPTION the data was already valid. Only
  // fall back to the nearest `decision` step when no ai_processing step
  // precedes the review at all.
  const firstReviewIdx = reviewIndices[0]
  let gateIdx = -1
  if (firstReviewIdx !== undefined) {
    for (let i = firstReviewIdx - 1; i >= 0; i--) {
      if (steps[i].type === 'ai_processing') { gateIdx = i; break }
    }
    if (gateIdx === -1) {
      for (let i = firstReviewIdx - 1; i >= 0; i--) {
        if (steps[i].type === 'decision') { gateIdx = i; break }
      }
    }
  }

  const out: PlannedStep[] = []
  const reviewIndexSet = new Set(reviewIndices)

  for (let i = 0; i < steps.length; i++) {
    if (reviewIndexSet.has(i)) continue // consumed into the exception gate below
    const step = steps[i]

    if (step.type === 'decision') {
      out.push(...buildDecisionNodes(step, i, ctx))
    } else if (step.type === 'ai_processing') {
      out.push(opToPlannedStep({ action: step.action, categories: ['AI_REASONING'], sourceStepIndex: i }, nextNum(ctx), ctx.integrationsRequired))
    } else {
      const ops = decomposeStep(step, i, module.integrations_required, ctx.warnings)
      for (const op of ops) out.push(opToPlannedStep(op, nextNum(ctx), ctx.integrationsRequired))
    }

    if (i === gateIdx && reviewIndices.length > 0) {
      const reviewOps = reviewIndices.flatMap((ri) => decomposeHumanReview(steps[ri], ri))
      out.push(buildExceptionGate(reviewOps, step.action, i, ctx))
    }
  }

  // No natural gate found before the (only) review step(s) — still don't
  // leave them as a bare trailing linear step; wrap in a generic gate.
  if (reviewIndices.length > 0 && gateIdx === -1) {
    ctx.warnings.push(
      'No preceding ai_processing/decision step found for the human_review step(s) — wrapped in a generic completeness check; verify the gate condition manually.',
    )
    const reviewOps = reviewIndices.flatMap((ri) => decomposeHumanReview(steps[ri], ri))
    out.push(buildExceptionGate(reviewOps, 'review required', reviewIndices[0], ctx))
  }

  // Stage 5's target end-to-end pattern is TRIGGER → DATA → AI REASONING →
  // DECISION → ACTIONS → COMMUNICATION → SCHEDULING → AUDIT — every module
  // ends with a deterministic audit/log entry, never another AI call.
  if (out.length > 0) {
    out.push(opToPlannedStep(
      { action: 'Log workflow result', categories: ['AUDIT'], sourceStepIndex: steps.length - 1 },
      nextNum(ctx),
      ctx.integrationsRequired,
    ))
  }

  return out
}

// ── Stage 8: validation ───────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

function collectSteps(steps: PlannedStep[]): PlannedStep[] {
  const all: PlannedStep[] = []
  for (const s of steps) {
    all.push(s)
    for (const b of s.branches ?? []) all.push(...collectSteps(b.steps))
  }
  return all
}

/**
 * Stage 8 — structural checks on a planned workflow before it's handed to
 * the graph builder. Not a full n8n-schema validator (that already exists
 * in lib/workflows/n8nMcpClient.ts, at deploy time) — this checks the
 * planner's own contract: trigger present, branches well-formed, no empty
 * action text, exception paths actually reachable, and no step silently
 * defaulted to an AI Agent outside an AI_REASONING/DECISION category.
 */
export function validatePlannedWorkflow(planned: PlannedWorkflow): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = [...planned.warnings]

  if (!planned.trigger || !planned.trigger.trim()) errors.push('Workflow has no trigger.')
  if (planned.steps.length === 0) errors.push('Workflow has no steps.')

  const all = collectSteps(planned.steps)
  let hasExceptionRequirement = false
  let hasReachableExceptionPath = false

  for (const s of all) {
    if (!s.action || !s.action.trim()) errors.push(`Step ${s.step}: empty action text.`)

    if (s.type === 'switch' && (!s.branches || s.branches.length < 2)) {
      errors.push(`Step ${s.step} ("${s.action}"): switch node needs at least 2 branches.`)
    }
    if (s.type === 'condition' && (!s.branches || s.branches.length !== 2)) {
      errors.push(`Step ${s.step} ("${s.action}"): condition node needs exactly 2 branches.`)
    }

    if (s.category?.includes('EXCEPTION_HANDLING') || s.category?.includes('HUMAN_REVIEW')) {
      hasExceptionRequirement = true
      if ((s.branches?.length ?? 0) > 0) hasReachableExceptionPath = true
    }

    // No unnecessary AI: an 'ai' intent should only ever be resolved for a
    // step whose planning metadata actually flagged AI_REASONING. Mirrors
    // workflowConverter.ts's `step.forceIntent ?? detectNodeIntent(...)` —
    // checking detectNodeIntent() alone would both miss forced-AI steps and
    // misreport text-collision false positives as real findings.
    const intent = s.forceIntent ?? detectNodeIntent(s.action, s.tool)
    if (intent === 'ai' && s.category && !s.category.includes('AI_REASONING')) {
      warnings.push(`Step ${s.step} ("${s.action}") resolved to an AI Agent node without an AI_REASONING classification — verify this is intentional.`)
    }
  }

  if (hasExceptionRequirement && !hasReachableExceptionPath) {
    errors.push('Blueprint mentions exception/review handling but no reachable exception branch was generated.')
  }

  if (planned.unresolvedIntegrations.length > 0) {
    warnings.push(`Unresolved integrations (no matching node/credential): ${planned.unresolvedIntegrations.join(', ')}. These steps were kept as generic placeholders.`)
  }

  return { valid: errors.length === 0, errors, warnings }
}

// ── Top-level entry point ─────────────────────────────────────────────────────

/**
 * Plan an executable workflow from one blueprint module. This is the
 * replacement for the old 1-blueprint-step-= 1-node `toolForStep()` mapping
 * in app/api/console/workflows/from-blueprint/route.ts.
 *
 * Defense in depth: the route always runs sanitizeBlueprintModuleInput()
 * first, but this function is exported and may be called directly by other
 * code (tests, future callers) — a malformed `module.steps` must return an
 * empty plan, never throw.
 */
export function planWorkflowFromBlueprintModule(module: BlueprintModuleInput): PlannedWorkflow {
  if (!module || !Array.isArray(module.steps) || module.steps.length === 0) {
    return { trigger: module?.trigger || 'Manual or scheduled start', steps: [], integrations: [], unresolvedIntegrations: [], warnings: [] }
  }

  const integrationsRequired = Array.isArray(module.integrations_required)
    ? module.integrations_required.filter((i): i is string => typeof i === 'string' && !!i)
    : []

  const ctx: BuildContext = { integrationsRequired, warnings: [], stepCounter: { n: 0 } }
  const steps = buildPlannedSteps(module, ctx)

  // unresolvedIntegration is set once, at construction time, in
  // opToPlannedStep() — collected here rather than re-derived from `tool`
  // text, which would be lossy (see PlannedStep.unresolvedIntegration).
  const unresolvedIntegrations = collectSteps(steps)
    .filter((s) => s.unresolvedIntegration)
    .map((s) => s.action)

  const firstStep = module.steps[0]
  const trigger = firstStep && firstStep.type === 'ingestion'
    ? firstStep.action
    : (module.trigger || 'Manual or scheduled start')

  return {
    trigger,
    steps,
    integrations: integrationsRequired,
    unresolvedIntegrations,
    warnings: ctx.warnings,
  }
}

// ── Input hardening ────────────────────────────────────────────────────────
// A blueprint module is LLM/user-generated content reaching this planner
// over an HTTP API, not a trusted internal shape — validated defensively
// before any planning work happens, mirroring lib/workflows/
// deterministicPlanner.ts's sanitizeWorkflow() pattern for the copilot path.

/** DoS guard — a real blueprint module has well under this many steps; a
 *  payload anywhere near it is either abusive or malformed. */
export const MAX_BLUEPRINT_STEPS = 60
/** Per-field cap so one oversized string can't blow up node labels,
 *  regex scans, or the eventual n8n JSON payload. */
export const MAX_ACTION_TEXT_LENGTH = 2000
export const MAX_INTEGRATIONS = 50

const VALID_BLUEPRINT_STEP_TYPES: ReadonlySet<BlueprintStepType> = new Set([
  'ingestion', 'ai_processing', 'decision', 'execution', 'notification', 'human_review',
])

export interface SanitizeBlueprintInputResult {
  /** null when the input has no usable steps at all — see `errors`. */
  module: BlueprintModuleInput | null
  errors: string[]
  warnings: string[]
}

/**
 * Normalize a raw request body's blueprint-module fields before planning.
 * Caps step count and text length (DoS guard), coerces an unknown/missing
 * step `type` to 'execution' with a warning rather than failing the whole
 * request over one bad field, and drops steps with no usable action text.
 * Returns `module: null` with `errors` populated when nothing usable
 * survives — callers should respond 400, not attempt to plan.
 */
export function sanitizeBlueprintModuleInput(raw: {
  workflow_id?: unknown
  name?: unknown
  trigger?: unknown
  steps?: unknown
  integrations_required?: unknown
}): SanitizeBlueprintInputResult {
  const errors: string[] = []
  const warnings: string[] = []

  const rawSteps = Array.isArray(raw.steps) ? raw.steps : []
  if (rawSteps.length === 0) {
    errors.push('workflow_steps must be a non-empty array.')
    return { module: null, errors, warnings }
  }
  if (rawSteps.length > MAX_BLUEPRINT_STEPS) {
    errors.push(`workflow_steps exceeds the maximum of ${MAX_BLUEPRINT_STEPS} steps (got ${rawSteps.length}).`)
    return { module: null, errors, warnings }
  }

  const steps: BlueprintStepInput[] = []
  rawSteps.forEach((s: unknown, i: number) => {
    const rec = s && typeof s === 'object' ? (s as Record<string, unknown>) : {}
    const actionRaw = typeof rec.action === 'string' ? rec.action : typeof rec.title === 'string' ? rec.title : ''
    const trimmed = actionRaw.trim()
    if (!trimmed) {
      warnings.push(`Step ${i + 1}: no usable action text — dropped.`)
      return
    }
    const action = trimmed.slice(0, MAX_ACTION_TEXT_LENGTH)
    if (trimmed.length > MAX_ACTION_TEXT_LENGTH) {
      warnings.push(`Step ${i + 1}: action text truncated to ${MAX_ACTION_TEXT_LENGTH} characters.`)
    }

    const rawType = typeof rec.type === 'string' ? rec.type : ''
    const type = VALID_BLUEPRINT_STEP_TYPES.has(rawType as BlueprintStepType) ? (rawType as BlueprintStepType) : 'execution'
    if (rawType && type !== rawType) {
      warnings.push(`Step ${i + 1}: unknown step type "${rawType}" — treated as "execution".`)
    }

    steps.push({ type, action })
  })

  if (steps.length === 0) {
    errors.push('No steps had usable action text after sanitization.')
    return { module: null, errors, warnings }
  }

  const integrationsRaw = Array.isArray(raw.integrations_required) ? raw.integrations_required : []
  if (integrationsRaw.length > MAX_INTEGRATIONS) {
    warnings.push(`integrations_required exceeds ${MAX_INTEGRATIONS} entries — extras were dropped.`)
  }
  const integrations_required = integrationsRaw
    .filter((i): i is string => typeof i === 'string' && i.trim().length > 0)
    .slice(0, MAX_INTEGRATIONS)
    .map((i) => i.trim())

  return {
    module: {
      workflow_id: typeof raw.workflow_id === 'string' && raw.workflow_id ? raw.workflow_id : undefined,
      name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Workflow from blueprint',
      trigger: typeof raw.trigger === 'string' ? raw.trigger : '',
      steps,
      integrations_required,
    },
    errors,
    warnings,
  }
}
