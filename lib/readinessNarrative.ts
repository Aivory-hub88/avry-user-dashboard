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

/**
 * E1.7 — Confidence surfacing. Shared "evidence strength" label for the
 * Financial Case tiles, identical on the result page and the PDF. Returns
 * null for 'high' confidence (full data) so the indicator only appears where
 * a figure is actually resting on incomplete inputs — no badge clutter when
 * there's nothing to caveat.
 */
export function confidenceTileLabel(
  level: 'low' | 'medium' | 'high' | null | undefined
): string | null {
  if (!level || level === 'high') return null
  return `${cap(level)} confidence`
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
/**
 * Short, plain-business characterisation of each band — deliberately WORDED
 * DIFFERENTLY from `MATURITY_BANDS[].meaning` (which frames the band in terms
 * of pilot/rollout readiness and is used by the Executive Operational
 * Diagnosis). The Executive Summary opens the report and must not read as a
 * verbatim preview of the section that follows it.
 */
const MATURITY_BAND_POSTURE: Record<string, string> = {
  Nascent: 'the basics — clean data, written-down processes, clear owners — are not yet in place',
  Initiating: 'results still depend more on individual effort than on repeatable systems',
  Developing: 'core workflows exist but are applied unevenly across the business',
  Defined: 'processes are documented and followed consistently enough to scale on',
  Optimizing: 'operations are measured and instrumented, and improvement compounds',
}

/**
 * Opening section of the report.
 *
 * This used to be literally `buildVerdictNarrative(v)`'s first sentence, which
 * meant the Executive Summary and the Executive Operational Diagnosis opened
 * with the SAME sentence word-for-word ("With a composite score of X/100, …
 * five-level Aivory operational maturity scale (Nascent, Initiating, …)") —
 * two pages apart. It now leads on position → value at stake → the one
 * constraint, and hands off to the diagnosis rather than pre-empting it. The
 * band range and the five-level enumeration deliberately appear ONLY in the
 * diagnosis.
 */
export function buildExecutiveSummary(
  v: VerdictInputs & { businessValueLabel: string | null; topOpportunityTitle: string | null },
): string {
  const posture = MATURITY_BAND_POSTURE[v.maturityLevel] ?? MATURITY_BAND_POSTURE.Developing
  const article = /^[AEIOU]/i.test(v.maturityLevel) ? 'an' : 'a'
  const weakLabel = DIM_LABELS[v.weakestKey] ?? cap(v.weakestKey)

  const opening = `${v.company} operates at ${Math.round(v.composite)} out of 100 on the Aivory operational maturity scale — ${article} "${v.maturityLevel}" posture, where ${posture}.`

  let valueSentence = ''
  if (v.businessValueLabel && v.topOpportunityTitle) {
    valueSentence = ` Acting on the findings in this report is projected to unlock ${v.businessValueLabel} in annual business value, with ${v.topOpportunityTitle.toLowerCase()} the fastest first move.`
  } else if (v.businessValueLabel) {
    valueSentence = ` Acting on the findings in this report is projected to unlock ${v.businessValueLabel} in annual business value.`
  } else if (v.topOpportunityTitle) {
    valueSentence = ` The fastest first move is ${v.topOpportunityTitle.toLowerCase()}.`
  }

  const constraint = ` The single constraint standing in the way is ${weakLabel} (${v.weakestScore}) — examined in the diagnosis that follows.`

  return `${opening}${valueSentence}${constraint}`
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

// ─────────────────────────────────────────────────────────────────────────
// Phase E2.6 — section-level "so what" density pass. Short (5-15 word),
// one-line captions for the report's charts/tables, distinct from the
// section-level Executive Insight above: the Executive Insight covers the
// whole section's recommendation, these state the specific takeaway visible
// in ONE visual, derived only from fields already on DiagnosticContext.
// Deterministic string templates only, no LLM. Shared here so any caption
// that appears on both the result page and the PDF (dimension bars, ROI
// tiles, risk register) can never independently drift — see file header.
// ─────────────────────────────────────────────────────────────────────────

type DimensionKey = 'strategy' | 'data' | 'process' | 'people' | 'governance' | 'security'
const DIM_ORDER: DimensionKey[] = ['strategy', 'data', 'process', 'people', 'governance', 'security']

/**
 * Radar chart caption (page-only — the PDF renders a static score arc, not
 * a radar). States how far the weakest dimension trails the average of the
 * other five, the thing a reader can't get from the axis labels alone.
 */
export function buildDimensionSpreadCaption(
  scores: Record<string, number>,
): string {
  const vals = DIM_ORDER.map((k) => Math.round(scores[k] ?? 0))
  const weakestIdx = vals.indexOf(Math.min(...vals))
  const weakestKey = DIM_ORDER[weakestIdx]
  const others = vals.filter((_, i) => i !== weakestIdx)
  const avgOthers = others.reduce((a, b) => a + b, 0) / others.length
  const gap = Math.round(avgOthers - vals[weakestIdx])
  const label = DIM_LABELS[weakestKey] ?? cap(weakestKey)
  if (gap <= 3) {
    return 'Your six dimensions are evenly matched — no single area is dragging the profile down.'
  }
  return `${label} is your weakest link — it trails the average of your other five dimensions by ${gap} points.`
}

/**
 * Dimension bars caption — shared by the result page (DimensionBenchmarkBars)
 * and the PDF's dimension-bar block. Only meaningful once an industry
 * benchmark exists (the bars themselves show "vs median" ticks); returns
 * null so callers can omit the caption line entirely when there's no
 * benchmark to summarize, matching the bars' own graceful degradation.
 */
export function buildDimensionBenchmarkCaption(
  scores: Record<string, number>,
  benchmark: Partial<Record<DimensionKey, { median: number }>> | null | undefined,
): string | null {
  if (!benchmark) return null
  let below = 0
  let worstGap = -Infinity
  let worstKey: DimensionKey | null = null
  for (const key of DIM_ORDER) {
    const point = benchmark[key]
    if (!point) continue
    const score = Math.round(scores[key] ?? 0)
    if (score < point.median) below += 1
    const gap = point.median - score
    if (gap > worstGap) {
      worstGap = gap
      worstKey = key
    }
  }
  if (worstKey === null) return null
  if (below === 0) return 'You are at or above the industry median in every dimension measured.'
  const label = DIM_LABELS[worstKey] ?? cap(worstKey)
  return `Below industry median in ${below} of 6 dimensions — ${label} trails furthest, by ${Math.round(worstGap)} points.`
}

/**
 * Opportunity matrix caption (page-only — the PDF lists opportunity cards
 * linearly rather than plotting the impact/effort scatter). States the
 * quadrant distribution, the thing the scatter shape communicates that the
 * per-card list below it does not.
 */
export function buildOpportunityMatrixCaption(
  opportunities: Array<{ quadrant: string }>,
): string | null {
  if (!Array.isArray(opportunities) || opportunities.length === 0) return null
  const quickWins = opportunities.filter((o) => o.quadrant === 'quick_win').length
  if (quickWins === 0) {
    return 'No quick wins in this set — every opportunity here requires meaningful effort before payoff.'
  }
  const pct = Math.round((quickWins / opportunities.length) * 100)
  return `${quickWins} of ${opportunities.length} opportunities (${pct}%) are quick wins — high impact, low effort.`
}

/**
 * ROI metric tile grid caption — shared by the result page (roiGrid) and
 * the PDF's 2x2 financial tile block. States the labor-vs-process split
 * behind "Business Value Created", a relationship no single tile shows on
 * its own. Percentage-only (no currency) so page and PDF never need to pass
 * a formatter through — avoids re-opening the *Local-vs-*IDR formatting
 * bug class documented in app/diagnostics/deep/final-result/page.tsx.
 */
export function buildRoiTilesCaption(
  annualLaborSavingsLocal: number | null | undefined,
  annualProcessSavingsLocal: number | null | undefined,
): string | null {
  const labor = annualLaborSavingsLocal ?? 0
  const process = annualProcessSavingsLocal ?? 0
  const total = labor + process
  if (total <= 0) return null
  const laborPct = Math.round((labor / total) * 100)
  if (laborPct >= 55) {
    return `${laborPct}% of this value is recovered labor — process-efficiency gains are secondary.`
  }
  if (laborPct <= 45) {
    return `${100 - laborPct}% of this value comes from process-efficiency gains, not labor alone.`
  }
  return 'Value is split evenly between recovered labor and process-efficiency gains.'
}

/**
 * Operational Constraints (risk register) caption — shared by the result
 * page's RiskCard list and the PDF's renderRiskRegister. States whether
 * high-severity risks cluster around one signal, the pattern a reader would
 * otherwise have to scan every card to notice.
 */
export function buildRiskRegisterCaption(
  risks: Array<{ severity: 'HIGH' | 'MEDIUM' | 'LOW'; source: string }>,
): string | null {
  if (!Array.isArray(risks) || risks.length === 0) return null
  const highRisks = risks.filter((r) => r.severity === 'HIGH')
  if (highRisks.length === 0) {
    return `No high-severity risks — the ${risks.length} flagged item${risks.length === 1 ? '' : 's'} are lower-urgency watch items.`
  }
  const counts: Record<string, number> = {}
  for (const r of highRisks) counts[r.source] = (counts[r.source] ?? 0) + 1
  const [topSource, topCount] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  if (topCount > 1) {
    return `${highRisks.length} high-severity risks, concentrated in ${humanizeRiskSource(topSource).toLowerCase()}.`
  }
  return `${highRisks.length} high-severity risk${highRisks.length === 1 ? '' : 's'} ${highRisks.length === 1 ? 'requires' : 'require'} attention before scaling automation.`
}

/**
 * C5 — single-constraint fold line. When the Operational Constraints section
 * would carry FEWER THAN 2 risks it is not worth a standalone section (it
 * reads empty/templated), so the lone risk is folded into the Executive
 * Operational Diagnosis as one "Key constraint: …" line instead. Shared by
 * page and PDF so the folded sentence is identical on both surfaces. Returns
 * null unless there is exactly one risk (0 risks → nothing to fold; ≥2 → the
 * section stands on its own).
 */
export function buildFoldedConstraintNote(
  risks: Array<{ risk: string; severity: 'HIGH' | 'MEDIUM' | 'LOW'; source: string }>,
): string | null {
  if (!Array.isArray(risks) || risks.length !== 1) return null
  const r = risks[0]
  const sourceClause = r.source ? ` (signal: ${humanizeRiskSource(r.source).toLowerCase()})` : ''
  const body = r.risk.trim().replace(/\.*$/, '')
  return `Key constraint: ${body}${sourceClause}.`
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
