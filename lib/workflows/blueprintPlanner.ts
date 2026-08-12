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
  /** Stage 6 — this branch does NOT rejoin the shared join node after its
   *  steps run (e.g. an exception/human-review path that must end in an
   *  explicit "awaiting resolution" state, never silently fall through
   *  into the normal/success continuation). See workflowConverter.ts's
   *  branch-wiring code, which is the only place this is actually read. */
  terminal?: boolean
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
  /** Which $json field the downstream condition/switch node should inspect.
   *  Set by buildExceptionGate ('is_complete') and buildDecisionNodes
   *  ('onboarding_route'). When absent, the graph builder defaults to
   *  '$json.response'. */
  conditionField?: string
  /** Expected output schema for AI/reasoning nodes — embedded in the LLM's
   *  system message so it responds with structured JSON instead of free
   *  text. Set for validation steps ({is_complete, service_type, ...}) and
   *  classification steps ({onboarding_route, ...}). */
  aiOutputSchema?: Record<string, any>
  /** NON-NEGOTIABLE governance metadata — every AI Agent node MUST carry
   *  this, proving why a deterministic alternative cannot do the job. The
   *  validator rejects any AI step missing this, or whose
   *  `deterministic_alternative_available` is true. */
  aiReasoning?: {
    reasoning_required: true
    reason: string
    /** Set to false at planning time. Typed as `boolean` (not `false`) so
     *  the validator can check for a buggy `true` value from future code
     *  that shouldn't have created an AI Agent. */
    deterministic_alternative_available: boolean
  }
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
  // A pure BUSINESS_ACTION or DATA_RETRIEVAL step must NEVER fall through
  // to detectNodeIntent()'s text-based AI guess — the planner has already
  // classified it as deterministic. Without this guard, a word like
  // "process" (in "Process the record") would match the AI regex and turn
  // a deterministic action into an AI Agent node. COMMUNICATION stays
  // text-detected so email/slack/whatsapp can be distinguished from HTTP.
  if (op.categories.includes('BUSINESS_ACTION') || op.categories.includes('DATA_RETRIEVAL')) {
    return 'http'
  }
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
    // Attach the structured-output schema so the AI Agent node's system
    // message includes it — the downstream switch checks $json.onboarding_route.
    out[out.length - 1].aiOutputSchema = { onboarding_route: 'route_a' }
    out[out.length - 1].aiReasoning = {
      reasoning_required: true,
      reason: 'Open-ended profile-based routing requires reasoning over business criteria with no fixed numeric threshold — the blueprint does not name a deterministic comparison.',
      deterministic_alternative_available: false,
    }
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
    conditionField: 'onboarding_route',
    branches: [
      { key: 'route_a', label: 'Route A', steps: [] },
      { key: 'route_b', label: 'Route B', steps: [] },
    ],
  })
  return out
}

/**
 * Build the completeness-gate condition wrapping one or more human_review
 * steps into an explicit exception branch, per Stage 6 — never a bare
 * trailing linear step. `gateLabel` names what's being checked (e.g. the
 * preceding AI validation step's action) for a clearer node label.
 *
 * Branch order matters: the graph builder (workflowConverter.ts) always
 * wires branches[0] to a condition node's TRUE output and branches[1] to
 * FALSE. "Data complete?" being TRUE must mean "continue" — so `complete`
 * is branches[0], `incomplete` is branches[1]. Getting this backwards
 * silently sends complete data down the exception path and vice versa.
 *
 * The exception branch is marked `terminal`: flag the case, ask the
 * requester for what's missing, then pause on an explicit wait/resume
 * node. It must NOT rejoin the success path — this planner doesn't
 * implement a re-validation loop yet, so "wait for human resolution" is
 * where the branch honestly ends, rather than silently falling through
 * into account creation with incomplete data.
 */
function buildExceptionGate(
  reviewOps: AtomicOp[],
  gateLabel: string,
  sourceStepIndex: number,
  ctx: BuildContext,
): PlannedStep {
  const reviewSteps: PlannedStep[] = reviewOps.map((op) => ({
    // The blueprint's own human_review text explains WHY this case needs
    // attention — it's a record/flag, not itself the resumable wait point
    // (that's the dedicated step appended below), so force it off the
    // 'humanReview' (Wait node) intent its own wording would otherwise
    // match.
    ...opToPlannedStep(op, nextNum(ctx), ctx.integrationsRequired),
    tool: 'Exception Queue',
    forceIntent: 'audit' as const,
  }))
  reviewSteps.push({
    step: nextNum(ctx),
    action: 'Request missing information from requester',
    tool: 'Notification channel',
    output: '',
    type: 'action',
    category: ['COMMUNICATION', 'EXCEPTION_HANDLING'],
    sourceStepIndex,
  })
  reviewSteps.push({
    step: nextNum(ctx),
    action: 'Wait for human resolution — branch ends here, no automatic continuation',
    tool: 'Human Review',
    output: '',
    type: 'action',
    category: ['HUMAN_REVIEW', 'EXCEPTION_HANDLING'],
    sourceStepIndex,
    forceIntent: 'humanReview',
  })

  return {
    step: nextNum(ctx),
    action: `Data complete? (${gateLabel})`,
    tool: 'Condition',
    output: '',
    type: 'condition',
    category: ['DECISION'],
    sourceStepIndex,
    conditionField: 'is_complete',
    branches: [
      { key: 'complete', label: 'Complete', steps: [] },
      { key: 'incomplete', label: 'Incomplete / Exception', steps: reviewSteps, terminal: true },
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
      // Validation AI steps must produce structured output that the downstream
      // "Data complete?" condition can inspect ($json.is_complete) rather than
      // relying on free-text $json.response which is nearly always non-empty.
      out[out.length - 1].aiOutputSchema = { is_complete: true, service_type: 'premium', missing_fields: [], confidence: 0.96 }
      out[out.length - 1].aiReasoning = {
        reasoning_required: true,
        reason: 'Semantic validation of data completeness and classification of service type require interpretation of unstructured/form input — no deterministic rule can assess whether arbitrary free-text fields are present and consistent.',
        deterministic_alternative_available: false,
      }
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

/** Normalizes action text for duplicate-condition comparison — case/
 *  whitespace-insensitive, and strips the "Data complete? (...)" gate
 *  wrapper so a duplicate is caught even if the inner label differs. */
function normalizeForDuplicateCheck(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ')
}

const BUSINESS_ACTION_ONLY: ReadonlySet<StepCategory> = new Set(['BUSINESS_ACTION'])

/**
 * Stage 8 — structural checks on a planned workflow before it's handed to
 * the graph builder. Not a full n8n-schema validator (that already exists
 * in lib/workflows/n8nMcpClient.ts, at deploy time) — this checks the
 * planner's own contract: trigger present, branches well-formed, no empty
 * action text, exception paths actually reachable *and* terminal, no
 * duplicate conditions, no business action stranded in a dead-end branch,
 * and no step silently defaulted to an AI Agent outside an AI_REASONING/
 * DECISION category.
 */
export function validatePlannedWorkflow(planned: PlannedWorkflow): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = [...planned.warnings]

  if (!planned.trigger || !planned.trigger.trim()) errors.push('Workflow has no trigger.')
  if (planned.steps.length === 0) errors.push('Workflow has no steps.')

  const all = collectSteps(planned.steps)
  const conditionTextSeen = new Map<string, number>()

  for (const s of all) {
    if (!s.action || !s.action.trim()) errors.push(`Step ${s.step}: empty action text.`)

    if (s.type === 'switch' && (!s.branches || s.branches.length < 2)) {
      errors.push(`Step ${s.step} ("${s.action}"): switch node needs at least 2 branches.`)
    }
    if (s.type === 'condition' && (!s.branches || s.branches.length !== 2)) {
      errors.push(`Step ${s.step} ("${s.action}"): condition node needs exactly 2 branches.`)
    }

    // Duplicate IF/switch conditions with identical semantics.
    if (s.type === 'condition' || s.type === 'switch') {
      const norm = normalizeForDuplicateCheck(s.action)
      const priorStep = conditionTextSeen.get(norm)
      if (priorStep !== undefined) {
        errors.push(`Step ${s.step} ("${s.action}") duplicates the condition already built at step ${priorStep} — a validation decision should appear once, immediately after its validation step, not twice.`)
      } else {
        conditionTextSeen.set(norm, s.step)
      }
    }

    // TRUE-branch / exception-branch inversion and auto-continue checks —
    // only meaningful for 2-way conditions (branches[0]=TRUE, branches[1]
    // =FALSE by the graph builder's convention; see workflowConverter.ts).
    if (s.type === 'condition' && s.branches?.length === 2) {
      const [trueBranch, falseBranch] = s.branches
      const branchIsException = (b: PlannedStepBranch) =>
        collectSteps(b.steps).some((step) => step.category?.includes('HUMAN_REVIEW') || step.category?.includes('EXCEPTION_HANDLING'))

      if (branchIsException(trueBranch) && !branchIsException(falseBranch)) {
        errors.push(`Step ${s.step} ("${s.action}"): the TRUE branch ("${trueBranch.label ?? trueBranch.key}") leads to exception/human-review handling while FALSE does not — this is almost always inverted. TRUE should mean the check passed (continue normally); FALSE should route to the exception path.`)
      }

      // Exception branch must not silently rejoin normal execution.
      for (const branch of s.branches) {
        if (branchIsException(branch) && !branch.terminal) {
          errors.push(`Step ${s.step} ("${s.action}"): branch "${branch.label ?? branch.key}" contains exception/human-review handling but isn't marked terminal — it will automatically continue into the normal-execution path after running.`)
        }
      }
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

    // NON-NEGOTIABLE governance — every AI Agent MUST carry reasoning
    // metadata proving a deterministic alternative doesn't exist.
    if (intent === 'ai') {
      if (!s.aiReasoning) {
        errors.push(`Step ${s.step} ("${s.action}"): AI Agent node has no aiReasoning metadata — every AI Agent must prove why a deterministic alternative cannot do the job.`)
      } else if (s.aiReasoning.deterministic_alternative_available === true) {
        errors.push(`Step ${s.step} ("${s.action}"): AI Agent node is marked deterministic_alternative_available=true — an AI Agent is forbidden when a deterministic alternative exists.`)
      } else if (!s.aiReasoning.reason || !s.aiReasoning.reason.trim()) {
        errors.push(`Step ${s.step} ("${s.action}"): AI Agent node's aiReasoning.reason is empty — must explain why reasoning is required.`)
      }
    }

    // Prohibited-deterministic-tasks-must-not-be-AI guard: a step whose
    // action text matches a deterministic verb (create, send, schedule,
    // notify, get, fetch, merge, log, etc.) may NEVER resolve to an AI
    // Agent, regardless of forceIntent or category — the action itself is
    // a deterministic operation.
    if (intent === 'ai') {
      const determinableAction = /\b(create|send|schedule|notify|get|fetch|merge|log|update|delete|insert|call|post|put|assign|register|provision|membuat|mengirim|menjadwalkan|memberitahukan|mengambil|menggabung|mencatat|mengupdate|menghapus|memasukkan|memanggil|mendaftar|menyediakan)\b/i.test(s.action)
      const isGenuineReasoning = s.category?.includes('AI_REASONING') && !determinableAction
      if (determinableAction && !isGenuineReasoning) {
        errors.push(`Step ${s.step} ("${s.action}"): a deterministic operation (create/send/schedule/notify/get/merge/log/etc.) is represented as an AI Agent — this MUST use a deterministic node (HTTP, email, calendar, database, transform, etc.) instead.`)
      }
    }

    // Rule 8: AI steps tagged as validation/classification must carry a
    // structured-output schema so downstream conditions can inspect fields
    // like $json.is_complete instead of guessing from free text.
    if (intent === 'ai' && s.category?.includes('AI_REASONING')) {
      const action = (s.action || '').toLowerCase()
      const isValidation = /validasi|validate|classification|classify/i.test(action)
      if (isValidation && !s.aiOutputSchema) {
        warnings.push(`Step ${s.step} ("${s.action}"): AI reasoning step for validation/classification has no aiOutputSchema — the downstream condition will have no structured field to inspect.`)
      }
    }

    // Rule 9: switch/condition nodes with 'onboarding_route' or similar
    // routing fields should have a preceding AI classification step.
    if ((s.type === 'switch' || s.type === 'condition') && s.conditionField === 'onboarding_route') {
      warnings.push(`Step ${s.step} ("${s.action}"): switch/condition references onboarding_route field — ensure a preceding AI classification step produces this structured output.`)
    }
  }

  // Exception reachability: a blueprint that mentions review/exception
  // handling must produce at least one `terminal` branch containing that
  // handling — not just any branch (an empty non-terminal placeholder, or
  // a branch that isn't actually reachable, doesn't count).
  const hasExceptionRequirement = all.some((s) => s.category?.includes('EXCEPTION_HANDLING') || s.category?.includes('HUMAN_REVIEW'))
  const hasReachableTerminalException = all.some((s) =>
    s.branches?.some((b) => b.terminal && collectSteps(b.steps).some((step) =>
      step.category?.includes('HUMAN_REVIEW') || step.category?.includes('EXCEPTION_HANDLING'))))
  if (hasExceptionRequirement && !hasReachableTerminalException) {
    errors.push('Blueprint mentions exception/review handling but no reachable, terminal exception branch was generated.')
  }

  // Business actions stranded in a dead-end (terminal) branch are
  // unreachable from the valid/success path — they'd only ever run as
  // part of an exception that, by definition, ends there.
  for (const s of all) {
    for (const branch of s.branches ?? []) {
      if (!branch.terminal) continue
      for (const inner of collectSteps(branch.steps)) {
        const cats = inner.category ?? []
        if (cats.some((c) => BUSINESS_ACTION_ONLY.has(c)) && !cats.includes('EXCEPTION_HANDLING') && !cats.includes('HUMAN_REVIEW')) {
          warnings.push(`Step ${inner.step} ("${inner.action}") is a business action placed inside the terminal branch "${branch.label ?? branch.key}" of step ${s.step} — it will never run as part of the normal/success path.`)
        }
      }
    }
  }

  if (planned.unresolvedIntegrations.length > 0) {
    warnings.push(`Unresolved integrations (no matching node/credential): ${planned.unresolvedIntegrations.join(', ')}. These steps were kept as generic placeholders.`)
  }

  return { valid: errors.length === 0, errors, warnings }
}

// ── Stage 8b: graph-level validation (post n8n conversion) ───────────────────

export interface GraphValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

/** Node types whose whole purpose is to end a path — having no outgoing
 *  connection is expected, not a bug. */
const TERMINAL_N8N_NODE_TYPES = new Set(['n8n-nodes-base.wait', 'n8n-nodes-base.respondToWebhook'])

const PLACEHOLDER_URL_PATTERN = /example\.com\/endpoint|UNRESOLVED_INTEGRATION/i

/**
 * Stage 8b — checks the ACTUAL n8n graph (nodes + connections) produced by
 * convertToN8nWorkflow(), not just the pre-conversion PlannedStep tree.
 * This is the layer that catches connectivity bugs the tree-level
 * validator structurally can't see — e.g. an empty (no extra steps) branch
 * that the graph builder forgot to wire to the join node still LOOKS fine
 * as a PlannedStep (branches: [{key, steps: []}]) but produces a real
 * dead-end once converted. Also enforces "no invented Limit node" at the
 * one place that heuristic could actually insert one.
 */
export function validateN8nGraph(n8nWorkflow: {
  nodes: Array<{ name: string; type: string; parameters?: Record<string, any> }>
  connections: Record<string, Record<string, Array<Array<{ node: string }>>>>
}): GraphValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  for (const n of n8nWorkflow.nodes) {
    // Rule 0: no invented Limit node (pre-existing).
    if (n.type === 'n8n-nodes-base.limit') {
      errors.push(`Node "${n.name}": an n8n-nodes-base.limit node was inserted without the blueprint requesting any processing/batch/concurrency limit.`)
    }

    // Rule 1: "Data complete?" IF node must NOT check $json.response isNotEmpty.
    if (n.type === 'n8n-nodes-base.if' && /data complete\?/i.test(n.name)) {
      const conds = n.parameters?.conditions?.conditions as Array<Record<string, any>> | undefined
      if (conds?.some((c: Record<string, any>) =>
        String(c.leftValue ?? '').includes('$json.response') &&
        c.operator?.operation === 'isNotEmpty'
      )) {
        errors.push(`Node "${n.name}": "Data complete?" condition checks $json.response isNotEmpty which is nearly always true — it must check a structured boolean field like $json.is_complete === true instead.`)
      }
    }

    // Rule 2: no downstream node should reference $("Webhook Trigger") directly
    // when there ARE ingestion/retrieval nodes upstream that it should consume.
    if (n.type !== 'n8n-nodes-base.webhook' && n.type !== 'n8n-nodes-base.scheduleTrigger') {
      // JSON.stringify escapes internal double-quotes, so check both the
      // serialized form and the original parameter values directly.
      const params = JSON.stringify(n.parameters ?? {})
      const paramValues = Object.values(n.parameters ?? {}).map(String).join(' ')
      if (params.includes('$("Webhook Trigger")') || params.includes('$(\\"Webhook Trigger\\")') || paramValues.includes('$("Webhook Trigger")')) {
        errors.push(`Node "${n.name}": references $("Webhook Trigger") directly instead of consuming the normalized output from an upstream ingestion/retrieval node.`)
      }
    }

    // Rule 3: wait nodes must either be terminal (no outgoing connection) OR
    // have a clear continuation (checked below in connectivity loop).

    // Rule 4: node labeled "re-validation" without a downstream validation.
    if (/re-validation|re.validation/i.test(n.name)) {
      warnings.push(`Node "${n.name}": labeled as "re-validation" but no actual re-validation loop exists — the branch terminates without a validation node downstream. Rename or implement the loop.`)
    }

    // Rule 5: switch nodes should have a preceding AI/classification source
    // when the switch field is `onboarding_route` or similar (not a raw data field).
    if (n.type === 'n8n-nodes-base.switch') {
      const conds = n.parameters?.rules?.values as Array<{ conditions?: { conditions?: Array<Record<string, any>> } }> | undefined
      const hasRouteCheck = conds?.some((v: any) =>
        String(v?.conditions?.conditions?.[0]?.leftValue ?? '').includes('onboarding_route')
      )
      if (hasRouteCheck) {
        const prevNodes = Object.values(n8nWorkflow.connections)
          .flatMap((byType) => Object.values(byType).flatMap((arrs) => arrs.flat()))
          .filter((t: any) => t.node === n.name)
        const hasAiUpstream = prevNodes.some((t: any) => {
          const src = n8nWorkflow.nodes.find((nn) => nn.name === t.node)
          return false // We can't trace back easily — check via name proximity.
        })
        // Actually, a simpler heuristic: if the node just before the switch
        // in the linear chain is NOT an AI Agent, warn.
        const incomingNodes = new Set<string>()
        for (const byType of Object.values(n8nWorkflow.connections)) {
          for (const branches of Object.values(byType)) {
            for (const arr of branches) {
              for (const t of arr) {
                if (t.node === n.name) incomingNodes.add(t.node)
              }
            }
          }
        }
        // Find nodes that connect TO this switch.
        const sourceNames: string[] = []
        for (const [from, byType] of Object.entries(n8nWorkflow.connections)) {
          for (const branches of Object.values(byType)) {
            for (const arr of branches) {
              if (arr.some((t: any) => t.node === n.name)) sourceNames.push(from)
            }
          }
        }
        const sources = n8nWorkflow.nodes.filter((nn) => sourceNames.includes(nn.name))
        const hasAiSource = sources.some((nn) =>
          nn.type === '@n8n/n8n-nodes-langchain.agent' ||
          nn.type.includes('langchain') ||
          nn.name.toLowerCase().includes('ai')
        )
        if (!hasAiSource) {
          warnings.push(`Node "${n.name}": switch uses onboarding_route field but has no visible AI Agent/classification source upstream — the route determination needs a reasoning step.`)
        }
      }
    }

    // Rule 6: placeholder integrations (example.com or UNRESOLVED_INTEGRATION)
    if (n.type === 'n8n-nodes-base.httpRequest') {
      const url = String(n.parameters?.url ?? '')
      if (PLACEHOLDER_URL_PATTERN.test(url)) {
        warnings.push(`Node "${n.name}": uses placeholder URL "${url}" — this integration is unresolved and requires manual configuration before the workflow is executable.`)
      }
    }

    // Rule 7: AI Agent nodes missing structured output schema (validation/classification steps)
    if (n.type === '@n8n/n8n-nodes-langchain.agent') {
      const systemMsg = String(n.parameters?.options?.systemMessage ?? '')
      const hasSchema = /must respond with valid JSON|JSON in this exact format|is_complete|onboarding_route/i.test(systemMsg)
      if (!hasSchema && /validasi|classify|classific|determine route|tentukan/i.test(n.name.toLowerCase())) {
        warnings.push(`Node "${n.name}": AI Agent node appears to be a validation/classification step but has no structured-output schema in its system message — output may be free text that downstream conditions can't reliably inspect.`)
      }
    }
  }

  const hasOutgoing = new Set(Object.keys(n8nWorkflow.connections))
  const hasIncoming = new Set<string>()
  for (const byType of Object.values(n8nWorkflow.connections)) {
    for (const branches of Object.values(byType)) {
      for (const arr of branches) {
        for (const t of arr) hasIncoming.add(t.node)
      }
    }
  }

  for (const n of n8nWorkflow.nodes) {
    const isTrigger = n.type.toLowerCase().includes('trigger') || n.type === 'n8n-nodes-base.webhook'
    const isSubNode = n.type.startsWith('@n8n/n8n-nodes-langchain.lmChat')

    if (!isTrigger && !isSubNode && !hasIncoming.has(n.name)) {
      errors.push(`Node "${n.name}" (${n.type}) has no incoming connection — disconnected from the rest of the graph.`)
    }
    if (!isSubNode && !hasOutgoing.has(n.name) && !TERMINAL_N8N_NODE_TYPES.has(n.type)) {
      warnings.push(`Node "${n.name}" (${n.type}) has no outgoing connection — this path dead-ends here; verify that's intentional.`)
    }
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
