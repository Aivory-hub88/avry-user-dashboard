/**
 * Single source of truth for the Executive Operational Diagnosis narrative
 * shared by the PDF export (lib/pdfExport.ts) and the on-screen final-result
 * page. Both surfaces MUST render these exact strings — the sentences are
 * built here, not copy-pasted, because independent copies are how the report
 * once showed 32.5%, 33% and 38% for the same underlying gap.
 */

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Client-facing labels for the six scoring dimensions. */
export const DIM_LABELS: Record<string, string> = {
  strategy: 'Strategy', data: 'Data', process: 'Process',
  people: 'People', governance: 'Governance', security: 'Security',
}

/**
 * Gap/percentage formatter — keeps fractional values exact (32.5%) instead of
 * letting each section round differently.
 */
export function fmtGap(v: number): string {
  return Number.isInteger(v) ? `${v}%` : `${v.toFixed(1)}%`
}

/** Client-facing labels for the internal answer keys used as risk sources. */
export const RISK_SOURCE_LABELS: Record<string, string> = {
  compliance_requirements: 'Compliance requirements',
  data_quality: 'Data quality',
  leadership_alignment: 'Leadership alignment',
  change_readiness: 'Change readiness',
  budget_allocated: 'Budget allocation',
  process_documentation: 'Process documentation',
  budget_range: 'Budget range',
  fte_count: 'Team size',
  annual_revenue: 'Annual revenue',
  automation_current: 'Current automation level',
}

export function humanizeRiskSource(src: string): string {
  return RISK_SOURCE_LABELS[src] ?? cap(src.replace(/_/g, ' '))
}

/**
 * Phase E1.2 — client-facing factor names for the raw answer keys used as
 * score drivers (see ScoreDriverItem.answerKey / computeScoreDrivers in
 * services/deepDiagnostic.ts). Same pattern as RISK_SOURCE_LABELS above.
 */
export const DRIVER_ANSWER_LABELS: Record<string, string> = {
  quantified_goal: 'Quantified objective',
  kpi_tracking: 'KPI tracking',
  success_timeline: 'Success timeline',
  data_centralization: 'Data centralization',
  data_quality: 'Data quality',
  system_integration: 'System integration',
  data_infrastructure: 'Data infrastructure',
  process_documentation: 'Process documentation',
  workflow_standardization: 'Workflow standardization',
  automation_current: 'Current automation level',
  internal_capability: 'Internal AI capability',
  change_readiness: 'Change readiness',
  decision_speed: 'Decision speed',
  leadership_alignment: 'Leadership alignment',
  risk_tolerance: 'Risk tolerance',
  budget_allocated: 'Budget allocation',
  ai_governance: 'AI governance',
  ai_data_privacy: 'AI data privacy',
  compliance_requirements: 'Compliance requirements',
  data_residency: 'Data residency',
}

export function humanizeDriverAnswerKey(key: string): string {
  return DRIVER_ANSWER_LABELS[key] ?? cap(key.replace(/_/g, ' '))
}

/** Five-band operational maturity scale — thresholds mirror services maturityFromScore. */
export const MATURITY_BANDS: Array<{ level: string; range: string; meaning: string }> = [
  { level: 'Nascent', range: '0–34', meaning: 'the foundational building blocks — reliable data, documented processes, and clear ownership — are not yet in place, so operational groundwork should come before any automation investment' },
  { level: 'Initiating', range: '35–49', meaning: 'the organization can support closely supervised pilots in narrow, low-risk workflows while the underlying data and process foundations are built up' },
  { level: 'Developing', range: '50–64', meaning: 'the organization can standardise and instrument its core workflows while piloting automation in narrow, low-risk areas — but is not yet ready for a broad, multi-department rollout' },
  { level: 'Defined', range: '65–79', meaning: 'the organization is ready for systematic operational transformation across several functions, with governance mature enough to manage risk at scale' },
  { level: 'Optimizing', range: '80–100', meaning: 'well-instrumented operational foundations are in place across the organization, and the focus shifts from standardisation to compounding advantage' },
]

/** What a low score in each dimension concretely blocks. */
export const DIM_CONSTRAINT_NOTES: Record<string, string> = {
  strategy: 'without quantified KPIs, improvement value stays invisible and investment decisions stall',
  data: 'inconsistent operational decisions and capped automation potential persist until core data is centralized and cleaned',
  process: 'automations stay fragile until core workflows are documented and standardized',
  people: 'adoption stalls without skills enablement and clear internal ownership',
  governance: 'scaling automation without oversight structures compounds operational risk',
  security: 'security and compliance guardrails need defining before sensitive data reaches AI systems',
}

/**
 * Per-dimension consequence chain, weakest dimension only (keep it focused).
 * Rendered as a compact "A → B → C → D" line on both surfaces via
 * `formatConsequenceChain`.
 */
export const DIM_CONSEQUENCE_CHAINS: Record<string, string[]> = {
  data: ['Low data maturity', 'Inconsistent operational decisions', 'Lower automation potential', 'Higher operating costs'],
  process: ['Undocumented core processes', 'Fragile, person-dependent operations', 'Automation breaks on exceptions', 'Slower, riskier scaling'],
  strategy: ['No quantified operational KPIs', 'Improvement value is invisible', 'Investment decisions stall', 'Efficiency gains go unfunded'],
  people: ['Missing skills and ownership', 'Change adoption stalls', 'Tools go unused', 'Manual work persists'],
  governance: ['No oversight structures', 'Inconsistent execution quality', 'Compounding operational risk', 'Scaling multiplies errors'],
  security: ['Undefined data guardrails', 'Sensitive data exposure risk', 'Compliance blockers surface late', 'Transformation initiatives stall'],
}

/** Joins a consequence chain into one narrative line: "A → B → C → D". */
export function formatConsequenceChain(chain: string[]): string {
  return chain.join(' → ')
}

/** Mandate sentence derived from the leadership-alignment answer. */
export function buildLeadershipClause(leadershipRaw: string): string {
  return leadershipRaw.includes('Fully aligned')
    ? 'Fully aligned leadership provides a strong mandate for scaled deployment.'
    : leadershipRaw.includes('Supportive')
      ? 'Leadership is supportive but cautious, so early initiatives should be low-risk and quickly measurable to build confidence.'
      : leadershipRaw.includes('Some interest')
        ? 'Leadership interest is still forming, so early wins need to make the business case visible.'
        : 'Securing explicit leadership sponsorship should accompany the first initiatives.'
}

export interface VerdictInputs {
  company: string
  composite: number
  maturityLevel: string
  weakestKey: string
  weakestScore: number
  strongestKey: string
  strongestScore: number
}

/** The band sentence: score, band range, practical meaning, constraint, foundation. */
export function buildVerdictNarrative(v: VerdictInputs): string {
  const band = MATURITY_BANDS.find((b) => b.level === v.maturityLevel) ?? MATURITY_BANDS[2]
  const weakestNote = DIM_CONSTRAINT_NOTES[v.weakestKey] ?? 'this dimension needs strengthening before automation can scale'
  return `With a composite score of ${Math.round(v.composite)}/100, ${v.company} sits in the "${v.maturityLevel}" band (${band.range}) of the five-level Aivory operational maturity scale (Nascent, Initiating, Developing, Defined, Optimizing). In practical terms, ${band.meaning}. The immediate constraint is ${DIM_LABELS[v.weakestKey] ?? cap(v.weakestKey)} (${v.weakestScore}): ${weakestNote}. ${DIM_LABELS[v.strongestKey] ?? cap(v.strongestKey)} (${v.strongestScore}) is the strongest foundation to build on.`
}

export interface FirstMove {
  title: string
  body: string
}

export interface FirstMovesInputs {
  firstImprovement: { title: string; recommendedAction: string } | null
  topOpportunity: { title: string; timeToValueWeeks: number; dataReadiness: string } | null
  hasBudgetInput: boolean
  leadershipClause: string
}

/** The first-moves rows, ordered foundation → proof → mandate/budget. */
export function buildFirstMoves(m: FirstMovesInputs): FirstMove[] {
  const moves: FirstMove[] = []
  if (m.firstImprovement) {
    moves.push({
      title: `Fix the foundation: ${m.firstImprovement.title}`,
      body: m.firstImprovement.recommendedAction,
    })
  }
  if (m.topOpportunity) {
    moves.push({
      title: `Prove value fast: ${m.topOpportunity.title}`,
      body: `Highest-impact starting opportunity — ${m.topOpportunity.timeToValueWeeks}-week time to value${m.topOpportunity.dataReadiness === 'ready' ? ', data ready today' : ''}.`,
    })
  }
  if (!m.hasBudgetInput) {
    moves.push({
      title: 'Size the budget',
      body: 'No implementation budget was provided in the assessment. Supplying a budget range completes the payback and ROI model and turns these estimates into a decision-ready business case.',
    })
  } else {
    moves.push({ title: 'Secure the mandate', body: m.leadershipClause })
  }
  return moves
}

/**
 * Executive Summary — the new opening section on both surfaces. 2–3
 * sentences: the first clause of buildVerdictNarrative (score + band),
 * the top opportunity, and the Business Value Created figure. Deterministic
 * string composition only — no new intelligence is generated here.
 */
export function buildExecutiveSummary(
  v: VerdictInputs & { businessValueLabel: string | null; topOpportunityTitle: string | null },
): string {
  const fullVerdict = buildVerdictNarrative(v)
  // First sentence only — the score/band clause, not the full constraint
  // breakdown (that lives in the Executive Operational Diagnosis section).
  const firstClause = fullVerdict.split(/(?<=\.)\s+/)[0]
  const oppClause = v.topOpportunityTitle
    ? ` The fastest path forward is ${v.topOpportunityTitle.toLowerCase()}.`
    : ''
  const valueClause = v.businessValueLabel
    ? ` Acting on these findings is projected to unlock ${v.businessValueLabel} in Business Value Created.`
    : ''
  return `${firstClause}${oppClause}${valueClause}`
}

/** Lowercase, consequence-first phrase describing what a weak dimension concretely is. */
const DIM_INSIGHT_LABEL: Record<string, string> = {
  data: 'unreliable and fragmented operational data',
  process: 'inconsistent operational processes',
  strategy: 'the absence of quantified operational KPIs',
  people: 'gaps in skills and clear ownership',
  governance: 'the absence of oversight structures',
  security: 'undefined data security guardrails',
}

/** The one recommendation to fix a weak dimension, phrased as an imperative clause. */
const DIM_INSIGHT_ACTION: Record<string, string> = {
  data: 'Centralizing and cleaning core data before scaling automation',
  process: 'Standardising workflows before automation',
  strategy: 'Defining quantified KPIs before funding new initiatives',
  people: 'Investing in skills enablement and clear ownership',
  governance: 'Establishing oversight structures before scaling automation',
  security: 'Defining data security guardrails before sensitive data reaches AI systems',
}

export interface ExecutiveInsightInputs {
  /** diagnosis */
  weakestKey?: string
  /** financial */
  paybackMonths?: number | null
  threeYearROIPercent?: number | null
  hasBudgetInput?: boolean
  /** opportunities */
  topOpportunityTitle?: string | null
  topOpportunityTimeToValueWeeks?: number | null
  topOpportunityDataReadiness?: string | null
  /** improvements */
  topImprovementTitle?: string | null
  topImprovementAction?: string | null
}

/**
 * Deterministic, consequence-first Executive Insight for a section — string
 * templates only, never an LLM call. Bar for quality (CMO reference):
 * "Your greatest constraint is not AI capability. It is inconsistent
 * operational processes. Standardising workflows before automation will
 * reduce implementation risk, improve adoption, and accelerate ROI."
 */
export function buildExecutiveInsight(
  section: 'diagnosis' | 'opportunities' | 'financial' | 'improvements',
  inputs: ExecutiveInsightInputs,
): string {
  switch (section) {
    case 'diagnosis': {
      const key = inputs.weakestKey ?? ''
      const label = DIM_INSIGHT_LABEL[key] ?? 'operational inconsistency across the organization'
      const action = DIM_INSIGHT_ACTION[key] ?? 'Strengthening this dimension before automation'
      return `Your greatest constraint is not AI capability. It is ${label}. ${action} will reduce implementation risk, improve adoption, and accelerate ROI.`
    }
    case 'opportunities': {
      if (!inputs.topOpportunityTitle) {
        return 'No automation opportunities have been derived yet. Re-running the Deep Diagnostic will generate a prioritised, ranked opportunity set to sequence first.'
      }
      const ttv = inputs.topOpportunityTimeToValueWeeks
      const readyClause = inputs.topOpportunityDataReadiness === 'ready' ? ', with data ready today' : ''
      return `The fastest path to proof is ${inputs.topOpportunityTitle.toLowerCase()}${ttv ? `, deliverable in as little as ${ttv} weeks` : ''}${readyClause}. Sequencing execution to start here builds momentum and de-risks the rest of the transformation roadmap.`
    }
    case 'financial': {
      if (inputs.hasBudgetInput && inputs.paybackMonths != null && inputs.threeYearROIPercent != null) {
        return `The financial case is decision-ready: payback in ${Math.round(inputs.paybackMonths)} months and a ${Math.round(inputs.threeYearROIPercent)}% three-year ROI. Approving budget now converts this analysis into compounding savings — every quarter of delay is a quarter of avoidable cost.`
      }
      return 'The financial case cannot be finalized without a budget input. Supplying a budget range this week turns these projections into a board-ready business case with an accurate payback period and three-year ROI.'
    }
    case 'improvements': {
      if (!inputs.topImprovementTitle) {
        return 'No improvement priorities have been identified yet. Re-running the Deep Diagnostic will surface the specific operational gaps to close first.'
      }
      const actionClause = inputs.topImprovementAction ? ` ${inputs.topImprovementAction}` : ''
      return `The highest-priority fix is ${inputs.topImprovementTitle}.${actionClause} Closing this gap first removes the single largest blocker to reliable automation and protects the financial case above.`
    }
  }
}

/**
 * AI Enablement — the closing paragraph on both surfaces. Positions AI as
 * the execution layer of the transformation (Business → Operations →
 * Processes → Data → Automation → AI), never the headline.
 */
export function buildAiEnablement(inputs: { topOpportunityTitle: string | null; weakestLabel: string }): string {
  const oppClause = inputs.topOpportunityTitle
    ? `starting with ${inputs.topOpportunityTitle.toLowerCase()}`
    : 'starting with the highest-priority opportunity identified in this report'
  const weakestClause = inputs.weakestLabel ? inputs.weakestLabel.toLowerCase() : 'the constraints identified above'
  return `AI is the execution layer of this transformation, not its headline. The sequence that delivers results is Business → Operations → Processes → Data → Automation → AI: clarify the business objective, fix the operating model, standardise the process, get the data right, automate what is now reliable, and only then deploy AI to accelerate it. With ${weakestClause} as the current constraint, closing that foundation comes first — from there, ${oppClause} is where AI-accelerated execution delivers the fastest, most defensible return. The Transformation Blueprint below turns this sequence into a deployment-ready plan.`
}
