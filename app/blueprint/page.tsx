// @ts-nocheck
'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BlueprintV1, BlueprintV1WorkflowModule } from '@/types/blueprint'
import { saveWorkflow } from '@/hooks/useWorkflows'
import { useRouterContext } from '@/contexts/RouterContext'
import { ContinuedFromConsole } from '@/components/routing/ContinuedFromConsole'
import BlueprintHeader from '@/components/blueprint/BlueprintHeader'
import styles from './blueprint.module.css'
import { exportBlueprintPDF, exportBlueprintDOCX } from '@/lib/blueprintExport'
import { useTranslations } from 'next-intl'
import { saveRoadmap } from '@/hooks/useRoadmap'

// ── Lucide-style inline SVG icons ────────────────────────────────────────────
function IconDatabase() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <ellipse cx="12" cy="5" rx="9" ry="3"/>
      <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/>
      <path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/>
    </svg>
  )
}
function IconSettings() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  )
}
function IconCpu() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="2"/>
      <rect x="9" y="9" width="6" height="6"/>
      <line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/>
      <line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/>
      <line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/>
      <line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/>
    </svg>
  )
}
function IconZap() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  )
}

// ── Static blueprint insights data ───────────────────────────────────────────
const BLUEPRINT_INSIGHTS = {
  score: 55,
  maturity: 'Emerging',
  heroDescription: `You are already well-positioned to accelerate your AI journey. At the Emerging stage, your organization has established foundational data infrastructure and begun automating key processes — the building blocks for rapid, scalable AI adoption. With focused effort over the next 12 months, you can close the remaining gaps and unlock measurable operational gains.`,
  levers: [
    { label: 'Data Foundation', text: 'Partially centralized architecture makes it faster to close the remaining gaps and reach full data readiness.' },
    { label: 'Automation Level', text: 'Current 25–50% automation creates a clear path to quick wins by extending existing pipelines.' },
    { label: 'Process Documentation', text: '50–75% coverage means your team already has the context needed to design reliable AI workflows.' },
    { label: 'Team Readiness', text: 'Existing operational knowledge is your strongest asset — AI tools amplify what your team already does well.' },
  ],
  strategicObjective: {
    goal: 'Achieve 30% operational cost reduction and 40% productivity improvement through targeted AI automation within 12 months.',
    rationale: `This ambition is realistic given your current state. Your partially centralized data architecture and existing automation baseline mean you are not starting from zero — you are accelerating from a running start. The two active workflow modules already demonstrate that your team can deliver AI-powered outcomes. Scaling these patterns across additional processes is the primary lever for hitting both targets.`,
  },
  metrics: [
    { metric: 'Client Onboarding Cycle', current: '2 weeks', target: '3 days', impact: '85% cycle time reduction' },
    { metric: 'Operational Cost Index', current: 'Baseline', target: '−30% by Q4', impact: 'Direct margin improvement' },
    { metric: 'Productivity Index', current: 'Baseline', target: '+40% across key workflows', impact: 'Output per FTE increase' },
    { metric: 'Document Generation Time', current: 'Manual, ~4 hrs/doc', target: '<15 min automated', impact: '94% time saving per document' },
    { metric: 'Data Quality Score', current: 'Partial (est. 60%)', target: '>90% validated records', impact: 'Fewer errors, higher AI confidence' },
  ],
  currentState: {
    summary: `Your organization sits at a pivotal inflection point. Data is partially centralized across Salesforce CRM, SAP ERP, and SharePoint — a strong foundation that only requires targeted quality improvements rather than a full rebuild. Automation currently covers 25–50% of eligible processes, which means the majority of efficiency gains are still ahead of you. Process documentation at 50–75% gives your AI systems enough context to operate reliably, while leaving room to formalize the remaining workflows. Organizationally, you have the operational knowledge and leadership alignment needed to move quickly.`,
    highlights: [
      'Data infrastructure: partially centralized, minor quality gaps',
      'Automation coverage: 25–50% of eligible processes',
      'Process documentation: 50–75% complete',
      'Two active AI workflow modules already in production',
    ],
  },
  architecture: {
    reference: 'Aligned with the Gartner AI Maturity Model for organizations at an emerging stage and consistent with McKinsey\'s AI-at-Scale best practices for building reusable AI foundations.',
    stages: [
      {
        label: 'Data Sources',
        icon: 'database',
        items: ['Salesforce CRM', 'SAP ERP', 'SharePoint Docs'],
      },
      {
        label: 'Processing',
        icon: 'settings',
        items: ['Data Validation', 'AI Feature Engineering'],
      },
      {
        label: 'Decision Engine',
        icon: 'cpu',
        items: ['Rule-based Logic', 'LLM-assisted Decisions'],
      },
      {
        label: 'Execution',
        icon: 'zap',
        items: ['Zapier Automation', 'API Layer'],
      },
    ],
  },
  workflowModules: [
    {
      name: 'AI-Powered Client Onboarding',
      status: 'Active',
      value: 'Reduces onboarding cycle from 2 weeks to 3 days by automating data collection, document generation, and stakeholder notifications.',
      maturity: 'Currently at early production stage with manual fallback paths in place.',
      next: 'Integrate SAP ERP data feed to eliminate the remaining manual data entry step.',
    },
    {
      name: 'Intelligent Document Generation',
      status: 'Active',
      value: 'Cuts document preparation time from ~4 hours to under 15 minutes using LLM-assisted templates and SharePoint data.',
      maturity: 'Stable in production; handling standard document types reliably.',
      next: 'Expand template library to cover compliance and contract documents.',
    },
    {
      name: 'Automated Data Quality Monitor',
      status: 'Quick Win',
      value: 'Continuously validates CRM and ERP records, flagging anomalies before they reach downstream AI systems.',
      maturity: 'Not yet implemented — low complexity, high impact.',
      next: 'Deploy as a scheduled n8n workflow with Slack alerting within 30 days.',
    },
    {
      name: 'Intelligent Reporting & Insights',
      status: 'Quick Win',
      value: 'Generates weekly operational summaries from Salesforce and SAP data, reducing manual reporting effort by an estimated 60%.',
      maturity: 'Not yet implemented — reuses existing data pipeline.',
      next: 'Build on top of the existing data processing layer; estimated 2-week delivery.',
    },
  ],
  roadmap: [
    {
      name: 'Wave 1 — Foundation',
      timeline: '0–3 months',
      impact: 'Establish data quality baseline and extend active modules',
      deliverables: [
        'Deploy Automated Data Quality Monitor across CRM and ERP',
        'Complete SAP ERP integration for Client Onboarding module',
        'Expand Document Generation template library (compliance + contracts)',
        'Formalize remaining 25–50% of process documentation',
        'Establish AI governance framework and data access controls',
      ],
      owner: 'Led by AI Champion team with support from Operations and IT',
    },
    {
      name: 'Wave 2 — Expansion',
      timeline: '3–12 months',
      impact: 'Scale automation to hit 30% cost reduction and 40% productivity targets',
      deliverables: [
        'Launch Intelligent Reporting & Insights module',
        'Extend LLM-assisted decision engine to 3+ additional workflows',
        'Achieve >90% data quality score across core systems',
        'Onboard 2 additional departments onto AI workflow platform',
        'Conduct quarterly AI maturity review and recalibrate roadmap',
      ],
      owner: 'Led by Operations with AI Champion team as enablers',
    },
  ],
  risks: [
    {
      theme: 'Data Quality & Silos',
      description: 'Fragmented data across Salesforce, SAP, and SharePoint creates inconsistencies that reduce AI model confidence and increase error rates in automated decisions.',
      actions: [
        'Deploy a centralized data validation layer as the first Wave 1 deliverable',
        'Assign a Data Steward role to own quality standards across systems',
        'Implement automated anomaly detection with weekly quality score reporting',
      ],
    },
    {
      theme: 'Process Gaps & Documentation',
      description: 'Undocumented processes create blind spots for AI systems, leading to edge cases that require manual intervention and slow down automation coverage.',
      actions: [
        'Run a 4-week process mapping sprint to document the remaining 25–50% of workflows',
        'Use AI-assisted documentation tools to accelerate capture and reduce team burden',
        'Prioritize documentation for the highest-volume, highest-impact processes first',
      ],
    },
    {
      theme: 'Team Bandwidth & Change Adoption',
      description: 'AI initiatives compete with day-to-day operational demands. Without dedicated capacity and clear ownership, momentum stalls after initial quick wins.',
      actions: [
        'Designate an AI Champion with 20–30% dedicated time for Wave 1 delivery',
        'Run a 2-day AI literacy workshop for operational leads before Wave 2 begins',
        'Celebrate and communicate early wins to build organizational confidence',
      ],
    },
  ],
  actions: [
    {
      label: 'Kick off Data Quality Sprint',
      owner: 'Data Steward / IT Lead',
      deadline: 'Within 30 days',
    },
    {
      label: 'Complete SAP ERP integration for Onboarding module',
      owner: 'AI Champion + IT',
      deadline: 'Within 45 days',
    },
    {
      label: 'Finalize process documentation for top 5 workflows',
      owner: 'Operations Lead',
      deadline: 'By end of Q2',
    },
    {
      label: 'Deploy Automated Data Quality Monitor',
      owner: 'AI Champion',
      deadline: 'Within 30 days',
    },
  ],
}


// ── Defensive coercion helpers ───────────────────────────────────────────────
// The LLM-generated blueprint sometimes returns objects where the UI expects
// strings (e.g. { description, risk, title }). These helpers normalise any
// shape into a plain display string so we never render "[object Object]".
// Detect if a value is the corrupted literal string "[object Object]" produced
// by older versions of the API route that did String(someObject).
function isCorruptedString(s: any): boolean {
  if (typeof s !== 'string') return false
  return s === '[object Object]' || s.trim() === '[object Object]'
}

function coerceToString(value: any, fallback = ''): string {
  if (value === null || value === undefined) return fallback
  if (typeof value === 'string') {
    // Discard corrupted "[object Object]" strings
    return isCorruptedString(value) ? fallback : value
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    return value.map(v => coerceToString(v)).filter(Boolean).join(', ')
  }
  if (typeof value === 'object') {
    // Common LLM shapes for risks / highlights / constraints
    const extracted = (
      value.description ||
      value.text ||
      value.summary ||
      value.title ||
      value.name ||
      value.risk ||
      value.label ||
      value.message ||
      value.content ||
      value.value ||
      value.detail ||
      value.primary_goal ||
      value.goal ||
      ''
    )
    if (extracted && !isCorruptedString(extracted)) {
      return typeof extracted === 'string' ? extracted : String(extracted)
    }
    // Last resort: try to stringify meaningfully
    try {
      const json = JSON.stringify(value)
      if (json && json !== '{}' && json !== '[]') {
        return json.length > 200 ? json.slice(0, 200) + '…' : json
      }
    } catch {}
    return fallback
  }
  return fallback
}

function coerceList(value: any): string[] {
  if (!value) return []
  if (Array.isArray(value)) {
    return value.map(v => coerceToString(v)).filter(s => s && !isCorruptedString(s))
  }
  const single = coerceToString(value)
  return (single && !isCorruptedString(single)) ? [single] : []
}

// Pull a numeric readiness score out of whatever shape the backend returns.
// Handles: number, numeric string ("80"), "80/100", or text containing "Score: 80".
function coerceScore(value: any, fallback = 0): number {
  if (typeof value === 'number' && !isNaN(value)) return Math.max(0, Math.min(100, value))
  if (typeof value === 'string') {
    const match = value.match(/(\d{1,3})/)
    if (match) {
      const n = parseInt(match[1], 10)
      if (!isNaN(n)) return Math.max(0, Math.min(100, n))
    }
  }
  return fallback
}

// Sanitize a stored blueprint object in-place so that fields that should be
// strings/numbers are never objects. This fixes corrupted localStorage data
// produced by older versions of the API route.
function sanitizeBlueprint(bp: any): any {
  if (!bp || typeof bp !== 'object') return bp

  // Fix score
  if (bp.diagnostic_summary) {
    const ds = bp.diagnostic_summary
    if (typeof ds.ai_readiness_score !== 'number' || ds.ai_readiness_score === 0) {
      // Try to extract from strategic_objective text if it contains "Score: 80/100"
      const goalText = typeof bp.strategic_objective === 'string'
        ? bp.strategic_objective
        : bp.strategic_objective?.primary_goal || ''
      const scoreMatch = goalText.match(/(?:Score|Readiness)[^\d]{0,20}(\d{1,3})\s*\/\s*100/i)
        || goalText.match(/(\d{1,3})\s*\/\s*100/)
      if (scoreMatch) {
        ds.ai_readiness_score = Math.max(0, Math.min(100, parseInt(scoreMatch[1], 10)))
      }
    }
    // Fix primary_constraints — ensure array of strings, discard corrupted
    if (Array.isArray(ds.primary_constraints)) {
      ds.primary_constraints = ds.primary_constraints
        .map((c: any) => typeof c === 'string' ? c : (c?.description || c?.title || c?.name || c?.text || ''))
        .filter((s: string) => s && !isCorruptedString(s))
      // If all were corrupted, use static fallback
      if (ds.primary_constraints.length === 0) {
        ds.primary_constraints = BLUEPRINT_INSIGHTS.currentState.highlights.slice(0, 3)
      }
    }
  }

  // Fix strategic_objective.primary_goal — truncate if it's a markdown blob
  if (bp.strategic_objective && typeof bp.strategic_objective === 'object') {
    const goal = bp.strategic_objective.primary_goal
    if (typeof goal === 'string' && goal.length > 500) {
      // It's the full markdown blob — extract just the strategic objectives section
      const match = goal.match(/Strategic Objectives?\*?\*?[:\s]*([\s\S]*?)(?=\n#{2,}|\*\*Current State|$)/i)
      if (match) {
        bp.strategic_objective.primary_goal = match[1]
          .replace(/\*\*/g, '').replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300)
      } else {
        // Just take first 300 chars stripped of markdown
        bp.strategic_objective.primary_goal = goal
          .replace(/```[\s\S]*?```/g, '').replace(/^#{1,6}\s+.*$/gm, '')
          .replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\n+/g, ' ').replace(/\s+/g, ' ')
          .trim().slice(0, 300)
      }
    }
  }

  // Fix risk_assessment — ensure arrays of strings, discard corrupted
  if (bp.risk_assessment) {
    const ra = bp.risk_assessment
    for (const key of ['data_risks', 'operational_risks', 'mitigation_strategies']) {
      if (Array.isArray(ra[key])) {
        ra[key] = ra[key]
          .map((item: any) => typeof item === 'string' ? item : (item?.description || item?.title || item?.name || item?.text || item?.risk || ''))
          .filter((s: string) => s && !isCorruptedString(s))
      }
    }
  }

  // Retroactive fix for hallucinated risks: if the original diagnostic data
  // explicitly had 0 risks, ensure the blueprint also shows 0 risks.
  try {
    if (typeof window !== 'undefined') {
      const diagRaw = localStorage.getItem('aivory_diagnostic_context')
      if (diagRaw) {
        const diag = JSON.parse(diagRaw)
        if (diag && Array.isArray(diag.risks) && diag.risks.length === 0 && bp.risk_assessment) {
          bp.risk_assessment.data_risks = []
          bp.risk_assessment.operational_risks = []
          bp.risk_assessment.mitigation_strategies = []
        }
      }
    }
  } catch {
    // Ignore errors
  }

  return bp
}

// Strip markdown formatting from text — used when an LLM dumps a full markdown
// blueprint into a field that should be a single short paragraph.
function stripMarkdown(text: string, maxLength = 280): string {
  if (!text || typeof text !== 'string') return ''
  let cleaned = text
    .replace(/```[\s\S]*?```/g, '')        // code blocks
    .replace(/^#{1,6}\s+.*$/gm, '')         // headers
    .replace(/\*\*([^*]+)\*\*/g, '$1')      // bold
    .replace(/\*([^*]+)\*/g, '$1')          // italics
    .replace(/^[-*+]\s+/gm, '')             // list markers
    .replace(/\n{2,}/g, ' ')                // paragraph breaks
    .replace(/\s+/g, ' ')                   // collapse whitespace
    .trim()
  if (cleaned.length > maxLength) {
    cleaned = cleaned.slice(0, maxLength).replace(/\s+\S*$/, '') + '…'
  }
  return cleaned
}

// ── Map VPS Bridge response → BLUEPRINT_INSIGHTS structure ───────────────────
function mapBlueprintToInsights(bp: any) {
  if (!bp) return BLUEPRINT_INSIGHTS
  const score = coerceScore(bp.diagnostic_summary?.ai_readiness_score, BLUEPRINT_INSIGHTS.score)
  const maturity = coerceToString(bp.diagnostic_summary?.maturity_level, BLUEPRINT_INSIGHTS.maturity)
  const strategic = bp.strategic_objective ?? {}
  const risk = bp.risk_assessment ?? {}
  const arch = bp.system_architecture ?? {}

  return {
    score,
    maturity,
    heroDescription: stripMarkdown(
      `Your company scores ${score}/100 at ${maturity} maturity. ${coerceToString(strategic.primary_goal) || coerceToString(strategic)}`,
      400
    ),
    levers: [
      { label: 'Data Sources', text: coerceList(arch.data_sources).join(', ') || BLUEPRINT_INSIGHTS.levers[0].text },
      { label: 'Processing', text: coerceList(arch.processing_layers).join(', ') || BLUEPRINT_INSIGHTS.levers[1].text },
      { label: 'Decision Engine', text: coerceToString(arch.decision_engine) || BLUEPRINT_INSIGHTS.levers[2].text },
      { label: 'Execution', text: coerceList(arch.execution_layer).join(', ') || BLUEPRINT_INSIGHTS.levers[3].text },
    ],
    strategicObjective: {
      goal: stripMarkdown(coerceToString(strategic.primary_goal) || coerceToString(strategic), 240) || BLUEPRINT_INSIGHTS.strategicObjective.goal,
      rationale: `Based on your ${maturity} maturity level with a score of ${score}/100, this goal is achievable within the proposed timeline.`,
    },
    metrics: (Array.isArray(strategic.kpi_targets) ? strategic.kpi_targets : []).map((k: any) => ({
      metric: coerceToString(k?.metric, 'Metric'),
      current: coerceToString(k?.current, 'Baseline'),
      target: coerceToString(k?.target, '—'),
      impact: coerceToString(k?.impact ?? k?.target, '—'),
    })).concat(BLUEPRINT_INSIGHTS.metrics.slice((Array.isArray(strategic.kpi_targets) ? strategic.kpi_targets : []).length)),
    currentState: {
      summary: `Your company is at ${maturity} maturity with an AI readiness score of ${score}/100.`,
      highlights: [
        ...coerceList(bp.diagnostic_summary?.primary_constraints),
        ...coerceList(risk.data_risks).slice(0, 2),
      ].filter(Boolean),
    },
    architecture: {
      reference: '',
      stages: [
        { label: 'Data Sources', icon: 'database', items: coerceList(arch.data_sources) },
        { label: 'Processing', icon: 'settings', items: coerceList(arch.processing_layers) },
        { label: 'Decision Engine', icon: 'cpu', items: [coerceToString(arch.decision_engine)].filter(Boolean) },
        { label: 'Execution', icon: 'zap', items: coerceList(arch.execution_layer) },
      ].filter(s => s.items.length > 0 && s.items[0] !== ''),
    },
    workflowModules: BLUEPRINT_INSIGHTS.workflowModules,
    roadmap: (Array.isArray(bp.deployment_plan?.waves) ? bp.deployment_plan.waves : []).map((w: any, i: number) => ({
      name: coerceToString(w?.name, `Wave ${i + 1}`),
      timeline: i === 0 ? '0–3 months' : '3–12 months',
      impact: coerceToString(w?.notes, ''),
      deliverables: coerceList(w?.included_workflows),
      owner: 'Led by AI Champion team',
    })).concat(BLUEPRINT_INSIGHTS.roadmap.slice((Array.isArray(bp.deployment_plan?.waves) ? bp.deployment_plan.waves : []).length)),
    risks: [
      ...coerceList(risk.data_risks).map((r: string) => ({
        theme: 'Data Risk',
        description: r,
        actions: coerceList(risk.mitigation_strategies).slice(0, 2),
      })),
      ...coerceList(risk.operational_risks).map((r: string) => ({
        theme: 'Operational Risk',
        description: r,
        actions: coerceList(risk.mitigation_strategies).slice(0, 2),
      })),
    ].slice(0, 3),
    actions: BLUEPRINT_INSIGHTS.actions,
  }
}

// ── BlueprintInsightsSection component ───────────────────────────────────────
interface InsightsSectionProps {
  workflowModules: BlueprintV1WorkflowModule[]
  deploymentPlan: BlueprintV1['deployment_plan'] | null
  generatingWorkflow: Record<string, boolean>
  generatedWorkflows: Record<string, GeneratedWorkflow>
  savedWorkflowIds: Record<string, string>
  workflowErrors: Record<string, string>
  onGenerateWorkflow: (wf: BlueprintV1WorkflowModule) => void
  onViewWorkflows: () => void
}

function BlueprintInsightsSection({
  blueprint,
  workflowModules,
  deploymentPlan,
  generatingWorkflow,
  generatedWorkflows,
  savedWorkflowIds,
  workflowErrors,
  onGenerateWorkflow,
  onViewWorkflows,
}: InsightsSectionProps & { blueprint?: any }) {
  const s = mapBlueprintToInsights(blueprint)
  // stroke-dashoffset for 55/100: circumference=251.2, offset = 251.2*(1-0.55) = 113.04
  const circumference = 251.2
  const offset = circumference * (1 - s.score / 100)

  function ArchIcon({ type }: { type: string }) {
    if (type === 'database') return <IconDatabase />
    if (type === 'settings') return <IconSettings />
    if (type === 'cpu') return <IconCpu />
    return <IconZap />
  }

  return (
    <section className={styles.insightsSection}>
      <h2 className={styles.insightsSectionTitle}>AI Blueprint Insights</h2>

      {/* Card 1 — Readiness Score */}
      <div className={styles.heroCard}>
        <div className={styles.heroScoreRow}>
          <div className={styles.heroRing} aria-label={`AI Readiness Score: ${s.score} out of 100`}>
            <svg className={styles.heroRingSvg} viewBox="0 0 96 96">
              <circle className={styles.heroRingBg} cx="48" cy="48" r="40" />
              <circle
                className={styles.heroRingFill}
                cx="48" cy="48" r="40"
                style={{ strokeDashoffset: offset }}
              />
            </svg>
            <div className={styles.heroRingLabel}>
              <span className={styles.heroRingScore}>{s.score}</span>
              <span className={styles.heroRingMax}>/100</span>
            </div>
          </div>
          <div className={styles.heroScoreInfo}>
            <h3 className={styles.heroScoreTitle}>AI Blueprint Readiness Score</h3>
            <div className={styles.heroMaturityBadge}>
              <span className={styles.heroMaturityDot} aria-hidden="true" />
              {s.maturity} Maturity
            </div>
          </div>
        </div>
        <p className={styles.heroDescription}>{s.heroDescription}</p>
        <div className={styles.heroLevers}>
          {s.levers.map((lever, i) => (
            <div key={i} className={styles.heroLever}>
              <span className={styles.heroLeverLabel}>{lever.label}</span>
              <span className={styles.heroLeverText}>{lever.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Card 2 — Strategic Objective */}
      <div className={styles.insightCard}>
        <h3 className={styles.insightCardTitle}>Strategic Objective</h3>
        <div className={styles.insightCardBody}>
          <p className={styles.insightParagraph}><strong style={{ color: '#f0f0f0', fontWeight: 600 }}>{s.strategicObjective.goal}</strong></p>
          <p className={styles.insightParagraph}>{s.strategicObjective.rationale}</p>
        </div>
      </div>

      {/* Card 3 — Metrics Table */}
      <div className={styles.insightCard}>
        <h3 className={styles.insightCardTitle}>Key Metrics &amp; Targets</h3>
        <div className={styles.insightCardBody}>
          <table className={styles.metricsTable}>
            <thead>
              <tr>
                <th>Metric</th>
                <th>Current</th>
                <th>Target</th>
                <th>Expected Impact</th>
              </tr>
            </thead>
            <tbody>
              {s.metrics.map((row: any, i: number) => (
                <tr key={i}>
                  <td style={{ color: '#ccc' }}>{row.metric}</td>
                  <td>{row.current}</td>
                  <td style={{ color: '#b7cba6', fontWeight: 600 }}>{row.target}</td>
                  <td>{row.impact}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Card 4 — Current State */}
      <div className={styles.insightCard}>
        <h3 className={styles.insightCardTitle}>Current State Summary</h3>
        <div className={styles.insightCardBody}>
          <p className={styles.insightParagraph}>{s.currentState.summary}</p>
          <span className={styles.insightSubheading}>Highlights</span>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {s.currentState.highlights.map((h, i) => (
              <li key={i} style={{ fontSize: '0.875rem', color: '#888', paddingLeft: 14, position: 'relative', lineHeight: 1.5 }}>
                <span style={{ position: 'absolute', left: 0, color: '#b7cba6' }}>•</span>
                {typeof h === 'string' ? h : coerceToString(h, 'Highlight')}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Card 5 — Recommended Architecture */}
      <div className={styles.insightCard}>
        <h3 className={styles.insightCardTitle}>Recommended Architecture</h3>
        <div className={styles.insightCardBody}>
          <div className={styles.archPipeline}>
            {s.architecture.stages.map((stage, i) => (
              <div key={i} style={{ display: 'contents' }}>
                <div className={styles.archPipelineNode}>
                  <div className={styles.archPipelineIcon}>
                    <ArchIcon type={stage.icon} />
                  </div>
                  <span className={styles.archPipelineLabel}>{stage.label}</span>
                  <ul className={styles.archPipelineItems}>
                    {stage.items.map((item: any, j: number) => <li key={j}>{item}</li>)}
                  </ul>
                </div>
                {i < s.architecture.stages.length - 1 && (
                  <span className={styles.archPipelineArrow} aria-hidden="true">→</span>
                )}
              </div>
            ))}
          </div>
          <p className={styles.insightParagraph} style={{ fontSize: '0.8125rem', color: '#555', fontStyle: 'italic' }}>
            {s.architecture.reference}
          </p>
        </div>
      </div>

      {/* Card 6 — Workflow Modules */}
      <div className={styles.insightCard}>
        <h3 className={styles.insightCardTitle}>Workflow Modules</h3>
        <div className={styles.insightCardBody}>
          <div className={styles.workflowModulesGrid}>
            {(workflowModules.length > 0 ? workflowModules : BLUEPRINT_INSIGHTS.workflowModules).map((wf, i) => {
              // Dynamic blueprint module — enrich with static insight data by index
              if ('workflow_id' in wf) {
                const dynWf = wf as BlueprintV1WorkflowModule
                const id = dynWf.workflow_id
                const isGenerating = generatingWorkflow[id]
                const generated = generatedWorkflows[id]
                const saved = savedWorkflowIds[id]
                const err = workflowErrors[id]
                // Pull enrichment from static data by position (best-effort)
                const enrichment = BLUEPRINT_INSIGHTS.workflowModules[i]
                return (
                  <div key={id} className={styles.workflowModuleCard}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <h4 className={styles.workflowModuleName}>{dynWf.name}</h4>
                      <button
                        className={styles.generateWorkflowBtn}
                        onClick={() => onGenerateWorkflow(dynWf)}
                        disabled={isGenerating}
                        aria-busy={isGenerating}
                      >
                        {isGenerating ? (
                          <><span className={styles.btnSpinnerSmall} aria-hidden="true" />Generating…</>
                        ) : generated ? 'Regenerate' : 'Generate'}
                      </button>
                    </div>
                    {enrichment && (
                      <span className={styles.workflowModuleStatus}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', flexShrink: 0 }} aria-hidden="true" />
                        {enrichment.status}
                      </span>
                    )}
                    {enrichment && <p className={styles.workflowModuleText}>{enrichment.value}</p>}
                    {enrichment && <p className={styles.workflowModuleText} style={{ color: '#666' }}>{enrichment.maturity}</p>}
                    <p className={styles.workflowModuleNext}>
                      <span className={styles.workflowModuleNextLabel}>Trigger: </span>
                      {dynWf.trigger}
                    </p>
                    {enrichment && (
                      <p className={styles.workflowModuleNext}>
                        <span className={styles.workflowModuleNextLabel}>Next step: </span>
                        {enrichment.next}
                      </p>
                    )}
                    {err && <p className={styles.workflowError}>{err}</p>}
                    {saved && (
                      <button className={styles.viewInWorkflowsBtn} onClick={onViewWorkflows}>
                        View in Workflows →
                      </button>
                    )}
                  </div>
                )
              }
              // Static fallback — synthesise a minimal BlueprintV1WorkflowModule so the
              // generate button works the same way as the dynamic branch
              const staticWf = wf as typeof BLUEPRINT_INSIGHTS.workflowModules[0]
              const staticId = `static-wf-${i}`
              const isGenerating = generatingWorkflow[staticId]
              const generated = generatedWorkflows[staticId]
              const saved = savedWorkflowIds[staticId]
              const err = workflowErrors[staticId]
              const syntheticModule: BlueprintV1WorkflowModule = {
                workflow_id: staticId,
                name: staticWf.name,
                trigger: staticWf.next,
                steps: [],
                integrations_required: [],
              }
              return (
                <div key={i} className={styles.workflowModuleCard}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <h4 className={styles.workflowModuleName}>{staticWf.name}</h4>
                    <button
                      className={styles.generateWorkflowBtn}
                      onClick={() => onGenerateWorkflow(syntheticModule)}
                      disabled={isGenerating}
                      aria-busy={isGenerating}
                    >
                      {isGenerating ? (
                        <><span className={styles.btnSpinnerSmall} aria-hidden="true" />Generating…</>
                      ) : generated ? 'Regenerate' : 'Generate'}
                    </button>
                  </div>
                  <span className={styles.workflowModuleStatus}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', flexShrink: 0 }} aria-hidden="true" />
                    {staticWf.status}
                  </span>
                  <p className={styles.workflowModuleText}>{staticWf.value}</p>
                  <p className={styles.workflowModuleText} style={{ color: '#666' }}>{staticWf.maturity}</p>
                  <p className={styles.workflowModuleNext}>
                    <span className={styles.workflowModuleNextLabel}>Next step: </span>
                    {staticWf.next}
                  </p>
                  {err && <p className={styles.workflowError}>{err}</p>}
                  {saved && (
                    <button className={styles.viewInWorkflowsBtn} onClick={onViewWorkflows}>
                      View in Workflows →
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Card 7 — Phased Roadmap */}
      <div className={styles.insightCard}>
        <h3 className={styles.insightCardTitle}>Phased Roadmap</h3>
        <div className={styles.insightCardBody}>
          <div className={styles.roadmapWaves}>
            {s.roadmap.map((wave: any, i: number) => (
              <div key={i} className={styles.roadmapWave}>
                <div className={styles.roadmapWaveHeader}>
                  <h4 className={styles.roadmapWaveName}>{wave.name}</h4>
                  <span className={styles.roadmapWaveTimeline}>{wave.timeline}</span>
                </div>
                <p className={styles.roadmapWaveImpact}>{wave.impact}</p>
                <ul className={styles.roadmapDeliverables}>
                  {wave.deliverables.map((d: any, j: number) => (
                    <li key={j} className={styles.roadmapDeliverable}>{d}</li>
                  ))}
                </ul>
                <p className={styles.roadmapWaveOwner}>
                  <span className={styles.roadmapWaveOwnerLabel}>Owner: </span>
                  {wave.owner}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Card 7b — Deployment Plan */}
      {deploymentPlan && (
        <div className={styles.insightCard}>
          <h3 className={styles.insightCardTitle}>Deployment Plan</h3>
          <div className={styles.insightCardBody}>
            <div className={styles.deployMetaRow}>
              <div className={styles.deployMetaItem}>
                <span className={styles.deployMetaLabel}>Phase</span>
                <span className={styles.deployMetaValue}>{deploymentPlan.phase}</span>
              </div>
              <div className={styles.deployMetaItem}>
                <span className={styles.deployMetaLabel}>Estimated ROI</span>
                <span className={styles.deployMetaValue} style={{ color: '#b7cba6', fontWeight: 600 }}>{deploymentPlan.estimated_roi_months} months</span>
              </div>
            </div>
            <p className={styles.insightParagraph}>{deploymentPlan.estimated_impact}</p>
            {deploymentPlan.waves && deploymentPlan.waves.length > 0 && (
              <div className={styles.deployWaves}>
                {deploymentPlan.waves.map((wave: any, i: number) => (
                  <div key={i} className={styles.deployWave}>
                    <div className={styles.deployWaveHeader}>
                      <span className={styles.deployWaveNum}>{i + 1}</span>
                      <span className={styles.deployWaveName}>{wave.name}</span>
                    </div>
                    {wave.included_workflows && wave.included_workflows.length > 0 && (
                      <div className={styles.deployWaveTags}>
                        {wave.included_workflows.map((wf, j) => (
                          <span key={j} className={styles.deployWaveTag}>{wf}</span>
                        ))}
                      </div>
                    )}
                    {wave.notes && <p className={styles.deployWaveNotes}>{wave.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Card 8 — Risk Mitigation */}
      <div className={styles.insightCard}>
        <h3 className={styles.insightCardTitle}>Risk Mitigation &amp; Opportunities</h3>
        <div className={styles.insightCardBody}>
          <div className={styles.riskThemes}>
            {s.risks.length === 0 ? (
              <p style={{ color: '#888', fontStyle: 'italic', padding: '1rem 0' }}>No specific risks were flagged for mitigation in this blueprint.</p>
            ) : (
              s.risks.map((risk, i) => (
                <div key={i} className={styles.riskTheme}>
                  <div className={styles.riskThemeHeader}>
                    <span className={styles.riskThemePriority}>{i + 1}</span>
                    <h4 className={styles.riskThemeName}>{risk.theme}</h4>
                  </div>
                  <p className={styles.riskThemeDesc}>{typeof risk.description === 'string' ? risk.description : coerceToString(risk.description, 'Risk identified')}</p>
                  <ul className={styles.riskThemeActions}>
                    {risk.actions.map((action, j) => (
                      <li key={j} className={styles.riskThemeAction}>{typeof action === 'string' ? action : coerceToString(action, 'Action required')}</li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Card 9 — Next Steps */}
      <div className={styles.insightCard}>
        <h3 className={styles.insightCardTitle}>Next 30–90 Days — Action Checklist</h3>
        <div className={styles.insightCardBody}>
          <div className={styles.actionChecklist}>
            {s.actions.map((action: any, i: number) => (
              <div key={i} className={styles.actionItem}>
                <span className={styles.actionItemNum}>{i + 1}</span>
                <div className={styles.actionItemBody}>
                  <span className={styles.actionItemLabel}>{action.label}</span>
                  <div className={styles.actionItemMeta}>
                    <span className={styles.actionItemOwner}><span>Owner:</span> {action.owner}</span>
                    <span className={styles.actionItemDeadline}><span>Deadline:</span> {action.deadline}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

const STEP_TYPE_COLORS: Record<string, string> = {
  ingestion: styles.badgeIngestion,
  ai_processing: styles.badgeAi,
  decision: styles.badgeDecision,
  execution: styles.badgeExecution,
  notification: styles.badgeNotification,
  human_review: styles.badgeHuman,
}

const SIZE_LABELS: Record<string, string> = {
  micro: 'Micro',
  sme: 'SME',
  'mid-market': 'Mid-Market',
  enterprise: 'Enterprise',
}

interface GeneratedWorkflow {
  workflow_id: string
  title: string
  trigger: string
  steps: Array<{ step: number; action: string; tool: string; output: string }>
  integrations: string[]
  estimated_time: string
  automation_percentage: string
  error_handling: string
  notes: string
}

interface BlueprintVersion {
  version: string
  label: string
  timestamp: string
  company_name: string
  diagnostic_score: number
  maturity_level: string
  blueprint_data: BlueprintV1
}

const VERSIONS_KEY = 'aivory_blueprint_versions'

function loadVersions(): BlueprintVersion[] {
  try {
    const raw = localStorage.getItem(VERSIONS_KEY)
    if (!raw) return []
    return JSON.parse(raw) as BlueprintVersion[]
  } catch {
    return []
  }
}

function saveVersion(version: BlueprintVersion): void {
  const versions = loadVersions()
  versions.push(version)
  localStorage.setItem(VERSIONS_KEY, JSON.stringify(versions))
}

function deleteVersion(versionLabel: string): void {
  const versions = loadVersions().filter(v => v.version !== versionLabel)
  localStorage.setItem(VERSIONS_KEY, JSON.stringify(versions))
}

export default function BlueprintPage() {
  const router = useRouter()
  const t = useTranslations("blueprint")
  const tCommon = useTranslations("common")
  const [blueprint, setBlueprint] = useState<BlueprintV1 | null>(null)
  const [parseError, setParseError] = useState(false)
  const [empty, setEmpty] = useState(false)
  const [currentVersionLabel, setCurrentVersionLabel] = useState<string | null>(null)
  const [routingNotice, setRoutingNotice] = useState<string | null>(null)
  // Cloud sync warning banner (Req 4.3): shown when Supabase save fails but localStorage succeeds
  const [cloudSyncWarning, setCloudSyncWarning] = useState(false)

  // Workflow generation state: keyed by workflow_id
  const [generatingWorkflow, setGeneratingWorkflow] = useState<Record<string, boolean>>({})
  const [generatedWorkflows, setGeneratedWorkflows] = useState<Record<string, GeneratedWorkflow>>({})
  const [workflowErrors, setWorkflowErrors] = useState<Record<string, string>>({})
  const [expandedWorkflows, setExpandedWorkflows] = useState<Record<string, boolean>>({})
  const [savedWorkflowIds, setSavedWorkflowIds] = useState<Record<string, string>>({})

  // Versioning state
  const [versions, setVersions] = useState<BlueprintVersion[]>([])
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [saveVersionName, setSaveVersionName] = useState('')
  const [showVersionHistory, setShowVersionHistory] = useState(false)
  const saveInputRef = useRef<HTMLInputElement>(null)

  const { pendingContext, clearPendingContext } = useRouterContext()

  useEffect(() => {
    if (!pendingContext) return
    if (Date.now() - pendingContext.timestamp > 5 * 60 * 1000) {
      clearPendingContext()
      return
    }
    if (pendingContext.targetRoute !== 'blueprint') return
    setRoutingNotice(pendingContext.aiReplySummary || pendingContext.triggerMessage)
    clearPendingContext()
  }, [pendingContext, clearPendingContext])

  // Download state
  const [downloadLoading, setDownloadLoading] = useState(false)
  const [showDownloadMenu, setShowDownloadMenu] = useState(false)
  const [toast, setToast] = useState('')
  const contentRef = useRef<HTMLDivElement>(null)
  const downloadMenuRef = useRef<HTMLDivElement>(null)

  // Roadmap generation state
  const [generatingRoadmap, setGeneratingRoadmap] = useState(false)

  useEffect(() => {
    // Load blueprint: try Supabase first (with 10s timeout), fall back to localStorage (Req 4.5–4.7)
    const loadBlueprintData = async () => {
      try {
        const { loadBlueprint: _loadBlueprint } = await import('@/lib/supabaseStorage')
        const result = await _loadBlueprint('demo_org')
        if (result) {
          setBlueprint(sanitizeBlueprint(result))
        } else {
          // Supabase returned nothing — try localStorage directly
          try {
            const raw = localStorage.getItem('aivory_blueprint')
            if (!raw) { setEmpty(true); return }
            const parsed = JSON.parse(raw) as BlueprintV1
            setBlueprint(sanitizeBlueprint(parsed))
          } catch {
            setParseError(true)
          }
        }
      } catch {
        // Supabase unavailable — fall back to localStorage (Req 4.7)
        try {
          const raw = localStorage.getItem('aivory_blueprint')
          if (!raw) { setEmpty(true); return }
          const parsed = JSON.parse(raw) as BlueprintV1
          setBlueprint(sanitizeBlueprint(parsed))
        } catch {
          setParseError(true)
        }
      }
    }
    loadBlueprintData()
    setVersions(loadVersions())
  }, [])

  useEffect(() => {
    if (showSaveModal && saveInputRef.current) {
      saveInputRef.current.focus()
    }
  }, [showSaveModal])

  // Close download menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(e.target as Node)) {
        setShowDownloadMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const handleDownloadPDF = async () => {
    if (!blueprint || downloadLoading) return
    setShowDownloadMenu(false)
    setDownloadLoading(true)
    try {
      await exportBlueprintPDF(blueprint, currentVersionLabel ?? 'Draft')
      showToast('Blueprint downloaded successfully')
    } catch (e) {
      showToast('PDF export failed. Try again.')
    } finally {
      setDownloadLoading(false)
    }
  }

  const handleDownloadDOCX = async () => {
    if (!blueprint || downloadLoading) return
    setShowDownloadMenu(false)
    setDownloadLoading(true)
    try {
      await exportBlueprintDOCX(blueprint, currentVersionLabel ?? 'Draft')
      showToast('Blueprint downloaded successfully')
    } catch (e) {
      showToast('DOCX export failed. Try again.')
    } finally {
      setDownloadLoading(false)
    }
  }

  const handleRegenerate = () => {
    localStorage.removeItem('aivory_blueprint')
    window.location.href = '/diagnostics/deep'
  }

  const handleGenerateRoadmap = async () => {
    if (!blueprint || generatingRoadmap) return
    setGeneratingRoadmap(true)
    try {
      const diagnosticContext = (() => {
        try { return JSON.parse(localStorage.getItem('aivory_deep_result') || '{}') } catch { return {} }
      })()
      const res = await fetch('/api/roadmap/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'blueprint',
          blueprintContext: blueprint,
          diagnosticContext,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to generate roadmap')
      saveRoadmap(data.roadmap)
      showToast('Roadmap generated! Redirecting…')
      setTimeout(() => router.push('/roadmap'), 800)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to generate roadmap')
      setGeneratingRoadmap(false)
    }
  }

  const handleGenerateWorkflow = async (wf: BlueprintV1WorkflowModule) => {
    const id = wf.workflow_id
    setGeneratingWorkflow(prev => ({ ...prev, [id]: true }))
    setWorkflowErrors(prev => ({ ...prev, [id]: '' }))

    try {
      const diagnosticContext = (() => {
        try { return JSON.parse(localStorage.getItem('aivory_deep_result') || '{}') } catch { return {} }
      })()

      const res = await fetch('/api/console/workflows/from-blueprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow_id: id,
          workflow_title: wf.name,
          workflow_steps: wf.steps,
          diagnostic_context: diagnosticContext,
          company_name: blueprint?.organization?.name || 'SME'
        })
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed to generate workflow' }))
        throw new Error(err.message || 'Failed to generate workflow')
      }

      const result: GeneratedWorkflow = await res.json()
      setGeneratedWorkflows(prev => ({ ...prev, [id]: result }))
      setExpandedWorkflows(prev => ({ ...prev, [id]: true }))

      // Save to localStorage workflows store
      // Use result.steps if populated; fall back to mapping blueprint steps directly
      // so the canvas always has something to render
      const stepsToSave = (result.steps && result.steps.length > 0)
        ? result.steps
        : wf.steps.map((s, i) => ({
            step: i + 1,
            action: s.action,
            tool: 'N/A',
            output: '',
          }))

      const savedId = saveWorkflow({
        workflow_id: result.workflow_id,
        title: result.title || wf.name,
        status: 'draft',
        source: 'blueprint',
        blueprint_version: currentVersionLabel || 'V1',
        company_name: blueprint?.organization?.name || 'SME',
        created_at: new Date().toISOString(),
        trigger: result.trigger || wf.trigger,
        steps: stepsToSave,
        integrations: result.integrations || wf.integrations_required || [],
        estimated_time: result.estimated_time,
        automation_percentage: result.automation_percentage,
        error_handling: result.error_handling,
        notes: result.notes,
      })
      setSavedWorkflowIds(prev => ({ ...prev, [id]: savedId }))
      
      // Show brief success toast then redirect
      showToast('Workflow berhasil dibuat! Membuka sekarang...')
      setTimeout(() => {
        // Navigate to the workflows list with the new workflow auto-selected
        // Use savedId (actual stored ID) not result.workflow_id — saveWorkflow may suffix -v2 on collision
        router.push(`/workflows?selected=${encodeURIComponent(savedId)}`)
      }, 800)
    } catch (err) {
      setWorkflowErrors(prev => ({
        ...prev,
        [id]: err instanceof Error ? err.message : 'Failed to generate workflow'
      }))
    } finally {
      setGeneratingWorkflow(prev => ({ ...prev, [id]: false }))
    }
  }

  // ── Versioning ───────────────────────────────────────────
  const nextVersionName = () => {
    const existing = loadVersions()
    return `V${existing.length + 1}`
  }

  const handleOpenSaveModal = () => {
    setSaveVersionName(nextVersionName())
    setShowSaveModal(true)
  }

  const handleSaveVersion = () => {
    if (!blueprint || !saveVersionName.trim()) return
    const version: BlueprintVersion = {
      version: saveVersionName.trim(),
      label: `${saveVersionName.trim()} — ${blueprint.organization?.name || 'Blueprint'}`,
      timestamp: new Date().toISOString(),
      company_name: blueprint.organization?.name || '',
      diagnostic_score: blueprint.diagnostic_summary?.ai_readiness_score ?? 0,
      maturity_level: blueprint.diagnostic_summary?.maturity_level ?? '',
      blueprint_data: blueprint
    }
    saveVersion(version)
    setVersions(loadVersions())
    setCurrentVersionLabel(saveVersionName.trim())
    setShowSaveModal(false)
  }

  const handleLoadVersion = (v: BlueprintVersion) => {
    setBlueprint(v.blueprint_data)
    setCurrentVersionLabel(v.version)
    setShowVersionHistory(false)
    setGeneratedWorkflows({})
    setExpandedWorkflows({})
  }

  const handleDeleteVersion = (versionLabel: string) => {
    deleteVersion(versionLabel)
    setVersions(loadVersions())
    if (currentVersionLabel === versionLabel) setCurrentVersionLabel(null)
  }

  if (empty) {
    return (
      <div className={styles.emptyContainer}>
        <div className={styles.emptyContent}>
          <p className={styles.emptyIcon}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>
          </p>
          <h1 className={styles.emptyTitle}>{t("noBlueprint")}</h1>
          <p className={styles.emptyText}>
            {t("emptyText")}
          </p>
          <Link href="/diagnostics" className={styles.ctaLink}>{t("generate")}</Link>
        </div>
      </div>
    )
  }

  if (parseError) {
    return (
      <div className={styles.emptyContainer}>
        <div className={styles.emptyContent}>
          <p className={styles.emptyIcon}>!</p>
          <h1 className={styles.emptyTitle}>{t("corruptedTitle")}</h1>
          <p className={styles.emptyText}>{t("corruptedText")}</p>
          <button className={styles.ctaLink} onClick={handleRegenerate}>{t("regenerateBlueprint")}</button>
        </div>
      </div>
    )
  }

  if (!blueprint) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner} />
      </div>
    )
  }

  const { organization, diagnostic_summary } = blueprint

  return (
    <div className={`${styles.page} font-manrope`}>
      {routingNotice !== null && (
        <ContinuedFromConsole summary={routingNotice} onDismiss={() => setRoutingNotice(null)} />
      )}
      {/* Cloud sync warning banner (Req 4.3): shown when Supabase save fails but localStorage succeeds */}
      {cloudSyncWarning && (
        <div
          role="alert"
          style={{
            position: 'sticky', top: 0, zIndex: 50,
            background: '#78350f', color: '#fef3c7',
            padding: '10px 16px', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', gap: 12, fontSize: '0.875rem',
            borderBottom: '1px solid #92400e',
          }}
        >
          <span>⚠️ Saved locally. Cloud sync failed — your blueprint won&apos;t appear on other devices.</span>
          <button
            onClick={() => setCloudSyncWarning(false)}
            aria-label="Dismiss cloud sync warning"
            style={{
              background: 'transparent', border: 'none', color: '#fef3c7',
              cursor: 'pointer', fontSize: '1rem', padding: '0 4px', lineHeight: 1,
            }}
          >✕</button>
        </div>
      )}
      <div className={styles.content} ref={contentRef}>

        {/* ── Header ─────────────────────────────────────────── */}
        <BlueprintHeader
          blueprintId={blueprint.blueprint_id || 'BP-001'}
          companyName={organization?.name || 'Company'}
          version={currentVersionLabel || blueprint.version || '1'}
          status={blueprint.status || 'draft'}
          maturityLevel={diagnostic_summary?.maturity_level || 'Emerging'}
          estimatedROI={blueprint.deployment_plan?.estimated_roi_months || 6}
          showSampleBanner={false}
          versions={versions.map(v => ({
            version: v.version,
            created_at: v.timestamp,
            created_by: 'System',
            status: 'saved'
          }))}
          onVersionChange={(v) => {
            const selected = versions.find(ver => ver.version === v)
            if (selected) handleLoadVersion(selected)
          }}
          onSaveVersion={handleOpenSaveModal}
          onDownloadPDF={handleDownloadPDF}
          onDownloadDOCX={handleDownloadDOCX}
          onShowHistory={() => setShowVersionHistory(true)}
          versionsCount={versions.length}
          downloadLoading={downloadLoading}
          generatingRoadmap={generatingRoadmap}
          onGenerateRoadmap={handleGenerateRoadmap}
        />

        {/* ── Version History panel ─────────────────────────── */}
        {showVersionHistory && (
          <section className={styles.versionHistoryPanel}>
            <h2 className={styles.sectionTitle}>{t("versionHistory")}</h2>
            <div className={styles.versionList}>
              {versions.map(v => (
                <div key={v.version} className={styles.versionRow}>
                  <div className={styles.versionInfo}>
                    <span className={styles.versionLabel}>{v.version}</span>
                    <span className={styles.versionMeta}>
                      {v.company_name} · {t("score")} {v.diagnostic_score} · {v.maturity_level} · {new Date(v.timestamp).toLocaleDateString()}
                    </span>
                  </div>
                  <div className={styles.versionActions}>
                    <button className={`${styles.versionLoadBtn} btn-style-a`} onClick={() => handleLoadVersion(v)}>{t("load")}</button>
                    <button className={`${styles.versionCompareBtn} btn-style-b`} disabled title={t("compare")}>{t("compare")}</button>
                    <button className={`${styles.versionDeleteBtn} btn-style-a`} onClick={() => handleDeleteVersion(v.version)}>{t("deleteVersion")}</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── AI Blueprint Insights ─────────────────────────── */}
        <BlueprintInsightsSection
          blueprint={blueprint}
          workflowModules={blueprint.workflow_modules ?? []}
          deploymentPlan={blueprint.deployment_plan ?? null}
          generatingWorkflow={generatingWorkflow}
          generatedWorkflows={generatedWorkflows}
          savedWorkflowIds={savedWorkflowIds}
          workflowErrors={workflowErrors}
          onGenerateWorkflow={handleGenerateWorkflow}
          onViewWorkflows={() => router.push('/workflows')}
        />

      </div>

      {/* ── Toast ────────────────────────────────────────────── */}
      {toast && (
        <div className={styles.toast} role="status" aria-live="polite">
          {toast}
        </div>
      )}

      {/* ── Save Version Modal ────────────────────────────────── */}
      {showSaveModal && (
        <div className={styles.modalOverlay} onClick={() => setShowSaveModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>{t("saveBlueprintVersion")}</h2>
            <p className={styles.modalDesc}>{t("saveVersionDesc")}</p>
            <input
              ref={saveInputRef}
              className={styles.modalInput}
              value={saveVersionName}
              onChange={e => setSaveVersionName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveVersion() }}
              placeholder={t("saveVersionPlaceholder")}
            />
            <div className={styles.modalActions}>
              <button className={`${styles.modalCancel} btn-style-a`} onClick={() => setShowSaveModal(false)}>{tCommon("cancel")}</button>
              <button
                className={`${styles.modalSave} btn-style-b`}
                onClick={handleSaveVersion}
                disabled={!saveVersionName.trim()}
              >
                {tCommon("save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
