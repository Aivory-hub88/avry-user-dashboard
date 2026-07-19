/**
 * Single source of truth for the Readiness Verdict narrative shared by the
 * PDF export (lib/pdfExport.ts) and the on-screen final-result page. Both
 * surfaces MUST render these exact strings — the sentences are built here,
 * not copy-pasted, because independent copies are how the report once showed
 * 32.5%, 33% and 38% for the same underlying gap.
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

/** Five-band readiness scale — thresholds mirror services maturityFromScore. */
export const MATURITY_BANDS: Array<{ level: string; range: string; meaning: string }> = [
  { level: 'Nascent', range: '0–34', meaning: 'the foundational building blocks — reliable data, documented processes, and clear ownership — are not yet in place, so readiness groundwork should come before any AI deployment' },
  { level: 'Initiating', range: '35–49', meaning: 'the organization is ready for closely supervised pilots in narrow, low-risk workflows while the underlying data and process foundations are built up' },
  { level: 'Developing', range: '50–64', meaning: 'the organization is ready to deploy its first production automations in well-bounded, low-risk workflows — but not yet ready for a broad, multi-department AI rollout' },
  { level: 'Defined', range: '65–79', meaning: 'the organization is ready for systematic AI adoption across several functions, with governance mature enough to manage risk at scale' },
  { level: 'Optimizing', range: '80–100', meaning: 'AI-ready foundations are in place across the organization, and the focus shifts from readiness to compounding advantage' },
]

/** What a low score in each dimension concretely blocks. */
export const DIM_CONSTRAINT_NOTES: Record<string, string> = {
  strategy: 'without quantified KPIs it is hard to prove value and prioritise the next automation',
  data: 'AI output quality stays capped until core data is centralized and cleaned',
  process: 'automations stay fragile until core workflows are documented and standardized',
  people: 'adoption stalls without skills enablement and clear internal ownership',
  governance: 'scaling automation without oversight structures compounds operational risk',
  security: 'security and compliance guardrails need defining before sensitive data reaches AI systems',
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
  return `With a composite score of ${Math.round(v.composite)}/100, ${v.company} sits in the "${v.maturityLevel}" band (${band.range}) of the five-level Aivory readiness scale (Nascent, Initiating, Developing, Defined, Optimizing). In practical terms, ${band.meaning}. The immediate constraint is ${DIM_LABELS[v.weakestKey] ?? cap(v.weakestKey)} (${v.weakestScore}): ${weakestNote}. ${DIM_LABELS[v.strongestKey] ?? cap(v.strongestKey)} (${v.strongestScore}) is the strongest foundation to build on.`
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
