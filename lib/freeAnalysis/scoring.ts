/**
 * Free Business Operations Analysis: questions, weights and scoring.
 *
 * Ported from the public free analysis that used to live on the landing page
 * (Aivory-hub88/Frntend-nxt src/app/free-diagnostic/FreeDiagnosticClient.tsx,
 * removed in Frntend-nxt#155). The question ids, weights, bands, thresholds and
 * every derivation below are kept identical, so a score here means exactly what
 * it meant there. Only the React around it changed: the dashboard renders it in
 * the Deep Diagnostic chat UI.
 *
 * Pure and server-safe: no React, no browser APIs, no LLM. The API route
 * recomputes the score from the raw answers with this same module, so a client
 * can never store a score its answers do not support.
 */

import { getAssessmentCopy, type AssessmentStrings, type Locale } from './copy'

export type { Locale } from './copy'

/**
 * The paid product's scoring dimensions. Every free question maps to one, so
 * the free profile and the paid radar speak the same language.
 * `security` is deliberately absent: it is a paid-only depth area.
 */
export type Dimension = 'process' | 'data' | 'strategy' | 'governance' | 'people'

export interface DimensionInfo {
  id: string
  label: string
  score: number
  weight: number
}

/** One of the five aggregated dimensions, plus the questions behind it. */
export interface DimensionScore {
  key: Dimension
  label: string
  score: number // 0-100, the mean of its member answers rescaled
  mean: number // 0-3, on the raw answer scale
  weakest: DimensionInfo
  strongest: DimensionInfo
  members: DimensionInfo[]
}

export interface InsightItem {
  title: string
  driver: string // the question that drove the dimension's position
  desc: string
  type: 'strength' | 'blocker'
}

/**
 * Twelve operational questions, none of which mention AI. Id and dimension
 * only: the text and options live in copy.ts, one set per language. Ids are
 * stored keys and must never be translated or renamed.
 */
export const QUESTION_SPEC: ReadonlyArray<{ id: string; dim: Dimension }> = [
  { id: 'process_documentation', dim: 'process' },
  { id: 'workflow_standardization', dim: 'process' },
  { id: 'data_availability', dim: 'data' },
  { id: 'systems_integration', dim: 'data' },
  { id: 'manual_workload', dim: 'process' },
  { id: 'rework_rate', dim: 'governance' },
  { id: 'handoff_delay', dim: 'process' },
  { id: 'decision_latency', dim: 'strategy' },
  { id: 'ownership_clarity', dim: 'governance' },
  { id: 'improvement_mandate', dim: 'strategy' },
  { id: 'change_readiness', dim: 'people' },
  { id: 'internal_capability', dim: 'people' },
]

export const TOTAL_QUESTIONS = QUESTION_SPEC.length

/** Total weight 13.7, unchanged from the landing page. */
export const WEIGHTS: Readonly<Record<string, number>> = {
  process_documentation: 1.0, workflow_standardization: 1.0, data_availability: 1.5,
  systems_integration: 0.8, manual_workload: 1.2, rework_rate: 1.2,
  handoff_delay: 1.0, decision_latency: 0.8, ownership_clarity: 1.5,
  improvement_mandate: 1.5, change_readiness: 1.0, internal_capability: 1.2,
}

/** Same instrument version as the landing page's last release. */
export const QUESTION_SET_VERSION = 2

/** Derived from the weights so a perfect run is exactly 100. */
export const MAX_RAW = Object.values(WEIGHTS).reduce((sum, w) => sum + w, 0) * 3

/** Dimension keys, in the order the profile renders them. */
export const DIMENSION_KEYS: Dimension[] = ['process', 'data', 'strategy', 'governance', 'people']

/** Industry and size option values, in the landing page's order. Labels live in copy.ts. */
export const INDUSTRY_VALUES = [
  'manufacturing', 'retail', 'financial', 'healthcare', 'logistics', 'professional',
  'property', 'technology', 'education', 'marketing', 'advertising', 'food_beverage', 'other',
] as const

export const SIZE_VALUES = ['micro', 'small', 'medium', 'large', 'enterprise'] as const

/** Matches the paid product's `maturityFromScore` name for name. */
export const MATURITY_STAGES = ['Nascent', 'Initiating', 'Developing', 'Defined', 'Optimising']

/** Start of the Defined band. A dimension at or above this is not a constraint. */
const DEFINED_BAND_FLOOR = 65
/** Start of the Developing band. Below this, a dimension is not a strength. */
const DEVELOPING_BAND_FLOOR = 50
/** Midpoint of the 0-100 dimension scale, used to count what is running weak. */
const MIDPOINT = 50

// ============================================================================
// SCORING ENGINE (verbatim from the landing page)
// ============================================================================
export function computeScore(answers: Record<string, number>): number {
  let rawScore = 0
  for (const [dim, val] of Object.entries(answers)) {
    rawScore += val * (WEIGHTS[dim] || 1.0)
  }
  return Math.round((rawScore / MAX_RAW) * 100)
}

// Thresholds mirror the paid `maturityFromScore` exactly (80 / 65 / 50 / 35).
export function getMaturityLevel(score: number): string {
  if (score >= 80) return 'Optimising'
  if (score >= 65) return 'Defined'
  if (score >= 50) return 'Developing'
  if (score >= 35) return 'Initiating'
  return 'Nascent'
}

export function getMaturityIndicatorPercent(level: string): number {
  const stageIndex = Math.max(0, MATURITY_STAGES.indexOf(level))
  return ((stageIndex + 0.5) / MATURITY_STAGES.length) * 100
}

/**
 * The twelve answers aggregated into the paid product's five dimensions.
 * `driver` is the member question that most explains the dimension's position.
 */
export function getDimensionProfile(answers: Record<string, number>, copy: AssessmentStrings): DimensionScore[] {
  return DIMENSION_KEYS.map(key => {
    const members: DimensionInfo[] = QUESTION_SPEC
      .filter(q => q.dim === key)
      .map(q => ({ id: q.id, label: copy.questionLabels[q.id] || q.id, score: answers[q.id] ?? 0, weight: WEIGHTS[q.id] || 1 }))

    const mean = members.reduce((sum, m) => sum + m.score, 0) / members.length
    // Heavier weight breaks ties, so the driver cited is the one that matters most.
    const byWeakest = [...members].sort((a, b) => a.score !== b.score ? a.score - b.score : b.weight - a.weight)

    return {
      key,
      label: copy.dimensions[key],
      score: Math.round((mean / 3) * 100),
      mean,
      weakest: byWeakest[0],
      strongest: byWeakest[byWeakest.length - 1],
      members,
    }
  })
}

/** The three weakest dimensions below the Defined band, weakest first. */
export function getBlockers(profile: DimensionScore[]): DimensionScore[] {
  return profile
    .filter(d => d.score < DEFINED_BAND_FLOOR)
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
}

/** The strongest remaining dimensions at Developing or above, blockers excluded. */
export function getStrengths(profile: DimensionScore[], exclude: Set<string>): DimensionScore[] {
  return profile
    .filter(d => !exclude.has(d.key) && d.score >= DEVELOPING_BAND_FLOOR)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
}

/** Soft prioritisation and a generic next step: where to look, never how to fix it. */
export function getQuickNote(
  score: number, maturity: string, strengths: DimensionScore[],
  blockers: DimensionScore[], copy: AssessmentStrings,
): { title: string; body: string } {
  const c = copy.card
  const title = c.quickNoteTitle(score, maturity)

  if (!blockers.length) {
    return { title, body: `${c.allStrong}${strengths[0] ? ' ' + c.strongestDimension(strengths[0].label, strengths[0].score) : ''}` }
  }

  const [worst, ...rest] = blockers
  const parts = [
    c.biggestConstraint(worst.label, worst.score, rest.map(d => d.label)),
    c.nextStep(worst.label),
  ]
  if (strengths[0]) parts.unshift(c.strongestDimension(strengths[0].label, strengths[0].score))
  return { title, body: parts.join(' ') }
}

/** The closing hook: the free tier's only mention of AI, derived from the answers. */
export function getClosingHook(profile: DimensionScore[], copy: AssessmentStrings): { finding: string; decline: string } {
  const below = profile.filter(d => d.score < MIDPOINT).length
  const h = copy.hook

  if (below === 0) return { finding: h.findingNone, decline: h.declineNone }
  if (below === 1) return { finding: h.findingOne, decline: h.declineOne }
  return { finding: h.findingMany(h.countWords[below] ?? String(below)), decline: h.declineMany }
}

export function getNarrative(companyName: string, score: number, maturity: string, copy: AssessmentStrings): string {
  return copy.narrative[maturity]?.(companyName, score) ?? ''
}

/** Up to three insight items: one per dimension, each naming the question that drove it. */
export function getInsightItems(
  strengths: DimensionScore[], blockers: DimensionScore[], copy: AssessmentStrings,
): InsightItem[] {
  const insightItems: InsightItem[] = []
  const primaryStrength = strengths[0]
  if (primaryStrength) {
    insightItems.push({
      title: primaryStrength.label,
      driver: `${primaryStrength.strongest.label} — ${primaryStrength.strongest.score}/3`,
      desc: copy.insights[primaryStrength.strongest.id]?.strength || '',
      type: 'strength',
    })
  }
  blockers.forEach((blocker, index) => {
    if (insightItems.length >= 3) return
    insightItems.push({
      title: blocker.label,
      driver: `${blocker.weakest.label} — ${blocker.weakest.score}/3`,
      desc: copy.insights[blocker.weakest.id]?.blocker || (index === 0
        ? 'A gap here creates friction that everything downstream has to absorb, usually as time nobody is measuring.'
        : ''),
      type: 'blocker',
    })
  })
  if (insightItems.length < 3) {
    const secondaryStrength = strengths.find(d => !insightItems.some(ins => ins.title === d.label))
    if (secondaryStrength) {
      insightItems.push({
        title: secondaryStrength.label,
        driver: `${secondaryStrength.strongest.label} — ${secondaryStrength.strongest.score}/3`,
        desc: copy.insights[secondaryStrength.strongest.id]?.strength || 'Solid performance here removes one of the constraints that usually slows operational change down.',
        type: 'strength',
      })
    }
  }
  return insightItems
}

// ============================================================================
// Dashboard additions: input validation and one call that derives everything
// ============================================================================

export interface FreeAnalysisProfile {
  companyName: string
  industry: string
  companySize: string
}

export interface FreeAnalysisInput extends FreeAnalysisProfile {
  answers: Record<string, number>
}

/** Same rule as the landing page's profile step (name at least 2 characters). */
export function isProfileValid(p: Partial<FreeAnalysisProfile>): boolean {
  return typeof p.companyName === 'string' && p.companyName.trim().length >= 2 &&
    (INDUSTRY_VALUES as readonly string[]).includes(p.industry ?? '') &&
    (SIZE_VALUES as readonly string[]).includes(p.companySize ?? '')
}

/**
 * Parses an untrusted submission. Returns null unless it has a valid profile
 * and an integer 0-3 answer for every one of the twelve questions (and nothing
 * else), so the server never scores a partial or padded answer set.
 */
export function parseFreeAnalysisInput(raw: unknown): FreeAnalysisInput | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const companyName = typeof r.companyName === 'string' ? r.companyName.trim().slice(0, 120) : ''
  const industry = typeof r.industry === 'string' ? r.industry : ''
  const companySize = typeof r.companySize === 'string' ? r.companySize : ''
  if (!isProfileValid({ companyName, industry, companySize })) return null

  const a = r.answers
  if (!a || typeof a !== 'object' || Array.isArray(a)) return null
  const keys = Object.keys(a)
  if (keys.length !== TOTAL_QUESTIONS) return null
  const answers: Record<string, number> = {}
  for (const q of QUESTION_SPEC) {
    const v = (a as Record<string, unknown>)[q.id]
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 3) return null
    answers[q.id] = v
  }
  return { companyName, industry, companySize, answers }
}

/** What gets stored per run: inputs plus the canonical (English) result. */
export interface StoredFreeAnalysis extends FreeAnalysisInput {
  score: number
  maturity: string
  /** Canonical English labels, comparable across languages. */
  strengths: string[]
  blockers: string[]
  dimensions: Record<Dimension, number>
  questionSetVersion: number
  completedAt: string
}

export function scoreFreeAnalysis(input: FreeAnalysisInput, completedAt: Date): StoredFreeAnalysis {
  const canonical = getAssessmentCopy('en')
  const score = computeScore(input.answers)
  const maturity = getMaturityLevel(score)
  const profile = getDimensionProfile(input.answers, canonical)
  const blockers = getBlockers(profile)
  const strengths = getStrengths(profile, new Set(blockers.map(b => b.key)))
  return {
    ...input,
    score,
    maturity,
    strengths: strengths.map(s => s.label),
    blockers: blockers.map(b => b.label),
    dimensions: Object.fromEntries(profile.map(d => [d.key, d.score])) as Record<Dimension, number>,
    questionSetVersion: QUESTION_SET_VERSION,
    completedAt: completedAt.toISOString(),
  }
}

/** Everything the results view renders, localised. */
export interface FreeAnalysisView {
  score: number
  maturity: string
  bandDescriptor: string
  indicatorPercent: number
  profile: DimensionScore[]
  blockers: DimensionScore[]
  strengths: DimensionScore[]
  quickNote: { title: string; body: string }
  closingHook: { finding: string; decline: string }
  insights: InsightItem[]
  narrative: string
  industryLabel: string
  sizeLabel: string
}

export function buildFreeAnalysisView(input: FreeAnalysisInput, locale: Locale): FreeAnalysisView {
  const copy = getAssessmentCopy(locale)
  const score = computeScore(input.answers)
  const maturity = getMaturityLevel(score)
  const profile = getDimensionProfile(input.answers, copy)
  const blockers = getBlockers(profile)
  const strengths = getStrengths(profile, new Set(blockers.map(b => b.key)))
  return {
    score,
    maturity,
    bandDescriptor: copy.bands[maturity]?.descriptor ?? '',
    indicatorPercent: getMaturityIndicatorPercent(maturity),
    profile,
    blockers,
    strengths,
    quickNote: getQuickNote(score, maturity, strengths, blockers, copy),
    closingHook: getClosingHook(profile, copy),
    insights: getInsightItems(strengths, blockers, copy),
    narrative: getNarrative(input.companyName.trim() || (locale === 'id' ? 'perusahaan Anda' : 'your company'), score, maturity, copy),
    industryLabel: copy.industries[input.industry] || input.industry,
    sizeLabel: copy.sizes[input.companySize] || input.companySize,
  }
}
