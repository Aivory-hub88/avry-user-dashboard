import { FreeDiagnosticResponse } from '@/types/freeDiagnostic'

// Weighted score per dimension
const WEIGHTS: Record<string, number> = {
  business_objective:        1.5,
  current_ai_usage:          1.0,
  data_availability:         1.5,
  process_documentation:     1.0,
  workflow_standardization:  1.0,
  erp_integration:           0.8,
  automation_level:          1.2,
  decision_speed:            0.8,
  leadership_alignment:      1.5,
  budget_ownership:           1.2,
  change_readiness:          1.0,
  internal_capability:       1.2,
}

// MAX_RAW = sum of all WEIGHTS * 3 = 14.5 * 3 = 43.5
const MAX_RAW = 43.5

// Strength labels for dimensions where answer >= 2
const STRENGTH_LABELS: Record<string, string> = {
  business_objective:       'AI business objective is clearly defined',
  current_ai_usage:         'Organization has real, hands-on AI experience',
  data_availability:        'Data foundation is available and centralized',
  process_documentation:    'Business processes are documented and ready to automate',
  workflow_standardization: 'Standardized workflows — easy to scale with AI',
  erp_integration:          'ERP and business systems are integrated',
  automation_level:         'Automation is already running — AI can accelerate further',
  decision_speed:           'Data-driven decision making is already fast',
  leadership_alignment:     'Leadership is actively championing AI initiatives',
  budget_ownership:           'AI budget is available and ready to allocate',
  change_readiness:         'Team is open to change and new technology adoption',
  internal_capability:      'Internal capability exists to own AI implementation',
}

// Blocker labels for dimensions where answer <= 1
const BLOCKER_LABELS: Record<string, string> = {
  business_objective:       'Business objective is unclear — AI will lack direction',
  current_ai_usage:         'No prior AI experience — high learning curve ahead',
  data_availability:        'Data is scattered or not centralized — AI cannot learn from it',
  process_documentation:    'Processes are undocumented — hard to identify automation targets',
  workflow_standardization: 'Workflows are still ad-hoc — AI will add complexity, not reduce it',
  erp_integration:          'Systems are not integrated — data silos will block implementation',
  automation_level:         'Everything is still manual — automation baseline is very low',
  decision_speed:           'Decision-making is slow — AI will struggle to show fast impact',
  leadership_alignment:     'Leadership is not aligned — risk of project being cancelled mid-way',
  budget_ownership:           'No AI budget — implementation cannot begin',
  change_readiness:         'High internal resistance — AI adoption will face significant friction',
  internal_capability:      'No internal AI team — full dependency on external vendors',
}

// Opportunity labels for dimensions with answer <= 1 that have actionable opportunities
const OPPORTUNITY_LABELS: Record<string, string> = {
  business_objective:       'Run an AI objective-setting workshop with key stakeholders',
  data_availability:        'Consolidate data into one platform — this is primary enabler for all AI',
  process_documentation:    'Document 3 most repetitive processes as automation candidates',
  workflow_standardization: 'Standardize one workflow as an AI proof-of-concept',
  erp_integration:          'Evaluate integration middleware (e.g. Zapier, MuleSoft, custom ETL)',
  automation_level:         'Pick one manual process for an automation pilot — prove small ROI first',
  leadership_alignment:     'Build an AI business case with concrete ROI projections for leadership',
  budget_ownership:           'Start with freemium/low-cost AI tools to build momentum without capex',
  internal_capability:      'Identify one internal "AI champion" to train more deeply',
  change_readiness:         'Design a change management plan before rolling out AI org-wide',
}

// Narrative templates for each maturity level
const NARRATIVE_TEMPLATES: Record<string, (score: number, topBlocker?: string) => string> = {
  Initial: (s, b) => `Your organization is at an early stage of AI readiness with a score of ${s}/100. This is a valid starting point — many successful organizations began from the same position. The biggest challenge right now is: ${b || 'multiple foundational gaps'}. Recommendation: don't attempt a broad AI rollout all at once. Start with one small, well-scoped pilot, measure results, then scale gradually.`,
  Developing: (s, b) => `With a score of ${s}/100, the foundation is beginning to take shape, but there are critical gaps to address before scaling. The area requiring the most attention is: ${b || 'several foundational elements'}. Organizations at this stage are most effective when focused on quick wins — choose an AI use case where ROI can be demonstrated within 30–90 days to build trust and momentum.`,
  Defined: (s, b) => `A score of ${s}/100 indicates solid readiness — processes are starting to be defined and several foundations are already in place. ${b ? 'One area still worth strengthening: ' + b + '.' : 'The foundation is solid.'} This is the right moment to move from experimentation to structured implementation with measurable business targets.`,
  Managed: (s, b) => `Your organization (score ${s}/100) is already at an advanced level — AI is managed and beginning to deliver real value. ${b ? 'One remaining area for improvement: ' + b + '.' : 'Nearly all dimensions are strong.'} The next step is expanding into more complex use cases and building tighter ROI monitoring systems.`,
  Optimizing: (s, _) => `A score of ${s}/100 places you among elite organizations that have made AI a core part of their operational DNA. The focus at this stage is no longer "does AI work" but "how does AI keep innovating" — explore generative AI, agentic workflows, and AI-driven competitive differentiation that is hard for competitors to replicate.`,
}

/**
 * Generate a unique diagnostic ID
 * Format: "DIAG_" + 8 random alphanumeric uppercase characters
 * Example: "DIAG_A3F9B2C1"
 */
export function generateDiagnosticId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = ''
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return `DIAG_${result}`
}

/**
 * Get maturity level based on score
 */
function getMaturityLevel(score: number): 'Initial' | 'Developing' | 'Defined' | 'Managed' | 'Optimizing' {
  if (score <= 39) return 'Initial'
  if (score <= 59) return 'Developing'
  if (score <= 74) return 'Defined'
  if (score <= 89) return 'Managed'
  return 'Optimizing'
}

/**
 * Compute free diagnostic result from answers
 * @param answers - Record of question IDs to answer values (0-3)
 * @returns FreeDiagnosticResponse with score, maturity, strengths, blockers, opportunities, and narrative
 */
export function computeDiagnostic(answers: Record<string, 0 | 1 | 2 | 3>): FreeDiagnosticResponse {
  // Calculate weighted raw score
  let rawScore = 0
  for (const [dimension, answer] of Object.entries(answers)) {
    const weight = WEIGHTS[dimension] || 1.0
    rawScore += answer * weight
  }

  // Normalize to 0-100
  const score = Math.round((rawScore / MAX_RAW) * 100)

  // Get maturity level
  const maturityLevel = getMaturityLevel(score)

  // Find strengths (answers >= 2), top 3 by highest value
  const strengthEntries = Object.entries(answers)
    .filter(([_, answer]) => answer >= 2)
    .sort((a, b) => b[1] - a[1]) // Sort by answer value descending
    .slice(0, 3)

  const strengths = strengthEntries.map(([dimension]) => STRENGTH_LABELS[dimension] || dimension)

  // Find blockers (answers <= 1), sorted by lowest value first, then highest weight
  const blockerEntries = Object.entries(answers)
    .filter(([_, answer]) => answer <= 1)
    .sort((a, b) => {
      // Primary sort: answer value ascending (lower = bigger blocker)
      if (a[1] !== b[1]) return a[1] - b[1]
      // Secondary sort: weight descending (higher weight = more important)
      return (WEIGHTS[b[0]] || 1.0) - (WEIGHTS[a[0]] || 1.0)
    })
    .slice(0, 3)

  const blockers = blockerEntries.map(([dimension]) => BLOCKER_LABELS[dimension] || dimension)

  // Find opportunities (subset of blockers with actionable labels), top 3
  const opportunityEntries = blockerEntries
    .filter(([dimension]) => OPPORTUNITY_LABELS[dimension] !== undefined)
    .slice(0, 3)

  const opportunities = opportunityEntries.map(([dimension]) => OPPORTUNITY_LABELS[dimension] || dimension)

  // Get top blocker for narrative
  const topBlocker = blockers[0] || undefined

  // Generate narrative
  const narrative = NARRATIVE_TEMPLATES[maturityLevel](score, topBlocker)

  // Build response
  return {
    diagnostic_id: generateDiagnosticId(),
    score,
    maturity_level: maturityLevel,
    strengths,
    blockers,
    opportunities,
    narrative,
    timestamp: new Date().toISOString(),
  }
}