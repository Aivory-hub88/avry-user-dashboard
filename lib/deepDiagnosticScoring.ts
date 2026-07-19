// =============================================================================
// DETERMINISTIC AI-READINESS SCORING for the Deep Diagnostic.
//
// The score MUST be reproducible: the same answers always produce the same
// number. We therefore compute it from a fixed rubric here — never from an LLM.
// (The LLM is still used for qualitative narrative prose, but its numbers are
// ignored. This mirrors the existing rule that ROI is formula-only.)
//
// Rubric design:
//   - Only genuine readiness signals are scored. Demographic / preference /
//     ROI-context questions (currency, industry, company_size, revenue,
//     budget_range, manual_hours_weekly, fte_count, target_automation,
//     compliance_requirements, data_residency, priority_areas,
//     preferred_approach, success_timeline, and all free-text) are EXCLUDED.
//   - Each scored question has a per-option score in [0,1] aligned to the
//     option order in constants/deepDiagnosticQuestions.ts, plus a weight.
//   - Final score = weighted mean over ANSWERED scored questions, ×100.
//     Unanswered questions are simply omitted from the mean so partial
//     completion still produces a fair, stable number.
// =============================================================================

import { DEEP_DIAGNOSTIC_PHASES } from '@/constants/deepDiagnosticQuestions'

type ScoredQuestion = {
  weight: number
  /** Score in [0,1] per option, aligned to the question's `options` order.
   *  Use null to exclude a specific option (e.g. "Other"/"Not sure"). */
  scores: (number | null)[]
  label: string
}

// Per-question rubric. Option order matches deepDiagnosticQuestions.ts exactly.
const RUBRIC: Record<string, ScoredQuestion> = {
  // ── Phase 1: Business Objective & KPI ──
  quantified_goal: { weight: 1.0, label: 'Goal quantification',
    scores: [1.0, 0.5, 0.0] }, // specific / not quantified / exploring
  kpi_tracking: { weight: 1.0, label: 'KPI tracking',
    scores: [1.0, 0.5, 0.35, 0.0, null] }, // dashboards/manual/spreadsheets/none/other

  // ── Phase 2: Data & Process Readiness (core — higher weights) ──
  data_centralization: { weight: 1.5, label: 'Data centralization',
    scores: [1.0, 0.66, 0.33, 0.0] },
  data_quality: { weight: 1.5, label: 'Data quality',
    scores: [1.0, 0.66, 0.33, 0.0] },
  process_documentation: { weight: 1.0, label: 'Process documentation',
    scores: [0.0, 0.33, 0.66, 1.0] }, // 0-25 / 25-50 / 50-75 / 75-100
  workflow_standardization: { weight: 1.0, label: 'Workflow standardization',
    scores: [1.0, 0.66, 0.33, 0.0] },
  system_integration: { weight: 1.5, label: 'System integration',
    scores: [1.0, 0.66, 0.33, 0.0] },
  automation_current: { weight: 1.0, label: 'Current automation',
    scores: [0.0, 0.25, 0.5, 0.75, 1.0] }, // 0-10 / 10-25 / 25-50 / 50-75 / 75-100

  // ── Phase 3: Risk & Constraints ──
  budget_allocated: { weight: 1.0, label: 'AI budget',
    scores: [1.0, 0.66, 0.33, 0.0] },
  leadership_alignment: { weight: 1.5, label: 'Leadership alignment',
    scores: [1.0, 0.66, 0.33, 0.0] },
  change_readiness: { weight: 1.0, label: 'Change readiness',
    scores: [1.0, 0.66, 0.33, 0.0] },
  risk_tolerance: { weight: 0.5, label: 'Risk tolerance',
    scores: [1.0, 0.66, 0.33, 0.0] },

  // ── Phase 4: AI Opportunity Mapping ──
  decision_speed: { weight: 0.75, label: 'Decision speed',
    scores: [1.0, 0.66, 0.33, 0.0] },
  internal_capability: { weight: 1.5, label: 'Internal AI capability',
    scores: [1.0, 0.66, 0.33, 0.0] },
  // successful / partial / unsuccessful / first attempt (neutral) / pilot
  prior_ai_attempts: { weight: 1.0, label: 'Prior AI experience',
    scores: [1.0, 0.7, 0.3, 0.4, 0.6] },
}

// Unified maturity taxonomy (single source of truth — replaces the three
// conflicting vocabularies that previously existed).
export type MaturityLevel = 'Foundational' | 'Developing' | 'Advancing' | 'Leading'

export function maturityFromScore(score: number): MaturityLevel {
  if (score < 40) return 'Foundational'
  if (score < 60) return 'Developing'
  if (score < 80) return 'Advancing'
  return 'Leading'
}

// Build a question-id -> options[] lookup once, so we can resolve the stored
// answer text back to its option index.
const OPTIONS_BY_QID: Record<string, string[]> = (() => {
  const map: Record<string, string[]> = {}
  for (const phase of DEEP_DIAGNOSTIC_PHASES) {
    for (const q of phase.questions) {
      if (Array.isArray((q as any).options)) map[q.id] = (q as any).options
    }
  }
  return map
})()

export interface ReadinessResult {
  score: number              // 0-100, integer, deterministic
  maturity_level: MaturityLevel
  strengths: string[]        // top scored dimensions (answered)
  gaps: string[]             // lowest scored dimensions (answered)
  answered_scored: number    // how many scored questions were answered
  dimension_scores: Record<string, number> // label -> 0..1, for debugging/UI
}

type PhasesPayload = Record<string, Record<string, any>>

/**
 * Deterministically compute the AI-readiness score from the diagnostic answers.
 * Pure function: identical input -> identical output. No I/O, no randomness.
 */
export function calculateReadinessScore(phases: PhasesPayload): ReadinessResult {
  // Flatten all { questionId: answer } pairs from every phase.
  const answers: Record<string, any> = {}
  for (const phaseAnswers of Object.values(phases || {})) {
    if (phaseAnswers && typeof phaseAnswers === 'object') {
      Object.assign(answers, phaseAnswers)
    }
  }

  let weightedSum = 0
  let weightTotal = 0
  let answeredScored = 0
  const dimensionScores: Record<string, number> = {}
  const perDimension: { label: string; value: number }[] = []

  for (const [qid, rule] of Object.entries(RUBRIC)) {
    const answer = answers[qid]
    if (answer == null || answer === '') continue // unanswered -> omit
    const options = OPTIONS_BY_QID[qid]
    if (!options) continue
    const idx = options.indexOf(String(answer))
    if (idx < 0) continue // answer not recognized -> omit (don't guess)
    const optScore = rule.scores[idx]
    if (optScore == null) continue // excluded option (e.g. "Other") -> omit

    weightedSum += optScore * rule.weight
    weightTotal += rule.weight
    answeredScored += 1
    dimensionScores[rule.label] = optScore
    perDimension.push({ label: rule.label, value: optScore })
  }

  // No recognized answers -> neutral 50 (matches the free diagnostic's
  // "no valid answers" fallback rather than a misleading 0).
  const raw = weightTotal > 0 ? (weightedSum / weightTotal) * 100 : 50
  const score = Math.min(100, Math.max(0, Math.round(raw)))

  // Strengths = highest-scoring answered dimensions; gaps = lowest.
  const sorted = [...perDimension].sort((a, b) => b.value - a.value)
  const strengths = sorted.filter(d => d.value >= 0.66).slice(0, 3).map(d => d.label)
  const gaps = [...sorted].reverse().filter(d => d.value <= 0.33).slice(0, 3).map(d => d.label)

  return {
    score,
    maturity_level: maturityFromScore(score),
    strengths,
    gaps,
    answered_scored: answeredScored,
    dimension_scores: dimensionScores,
  }
}
