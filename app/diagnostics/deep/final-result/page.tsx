'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { DiagnosticContext } from '@/types/diagnostic'
import HeaderBar from '@/components/result/HeaderBar'
import ScoreRing from '@/components/result/ScoreRing'
import RadarChart from '@/components/result/RadarChart'
import ROIMetricTile from '@/components/result/ROIMetricTile'
import OpportunityMatrix from '@/components/result/OpportunityMatrix'
import OpportunityCard from '@/components/result/OpportunityCard'
import RiskCard from '@/components/result/RiskCard'
import LoadingState from '@/components/result/LoadingState'
import ErrorCard from '@/components/result/ErrorCard'
import {
  formatCurrency,
  formatPercent,
  formatMonths,
  humanizeDimensionKey,
  parseCurrencyCode,
  type CurrencyCode,
} from '@/lib/resultFormatters'
import styles from './final-result.module.css'

// TODO: add schema version field to DiagnosticContext for forward compatibility
function validateContext(raw: unknown): DiagnosticContext | null {
  if (raw === null || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>

  const requiredKeys = ['company', 'calculations', 'scores', 'opportunities', 'risks', 'qualitative']
  for (const key of requiredKeys) {
    if (!(key in obj)) return null
  }

  if (!Array.isArray(obj.opportunities)) return null
  if (!Array.isArray(obj.risks)) return null
  if (typeof obj.scores !== 'object' || obj.scores === null) return null
  if (typeof obj.calculations !== 'object' || obj.calculations === null) return null
  if (typeof obj.qualitative !== 'object' || obj.qualitative === null) return null
  if (typeof obj.company !== 'string') return null

  return raw as DiagnosticContext
}

type PageState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; context: DiagnosticContext }

export default function FinalResultPage() {
  const router = useRouter()
  const [state, setState] = useState<PageState>({ status: 'loading' })
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const [blueprintState, setBlueprintState] = useState<
    | { status: 'idle' }
    | { status: 'generating' }
    | { status: 'done' }
    | { status: 'error'; message: string }
  >({ status: 'idle' })

  useEffect(() => {
    const loadContext = async () => {
      // Try Supabase first (Req 6.5–6.8), fall back to localStorage
      let raw: string | null = null
      try {
        const { loadDiagnosticContext } = await import('@/lib/supabaseStorage')
        const supabaseCtx = await loadDiagnosticContext('demo_org')
        if (supabaseCtx) {
          const context = validateContext(supabaseCtx)
          if (context) {
            setState({ status: 'loaded', context })
            return
          }
        }
      } catch {
        // Supabase unavailable — fall through to localStorage
      }

      // localStorage fallback (Req 6.7)
      raw = localStorage.getItem('aivory_diagnostic_context')
      if (!raw) {
        router.push('/diagnostics/deep')
        return
      }
      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch (e) {
        setState({ status: 'error', message: 'Failed to parse diagnostic data. Please run the diagnostic again.' })
        return
      }
      const context = validateContext(parsed)
      if (!context) {
        setState({ status: 'error', message: 'Diagnostic data is malformed or incomplete. Please run the diagnostic again.' })
        return
      }
      setState({ status: 'loaded', context })
    }
    loadContext()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (state.status === 'loading') return <LoadingState />
  if (state.status === 'error') return <ErrorCard message={state.message} />

  const { context } = state
  const { scores, calculations, opportunities, risks, qualitative } = context

  const handleGenerateBlueprint = async () => {
    setBlueprintState({ status: 'generating' })
    try {
      const orgId = context.company.toLowerCase().replace(/\s+/g, '_') || 'demo_org'

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 120_000)

      let res: Response
      try {
        res = await fetch('/api/blueprints/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ diagnostic: context }),
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timeout)
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        let errMsg = `Blueprint generation failed (${res.status})`
        try {
          const errJson = JSON.parse(errText)
          errMsg = errJson.message || errJson.error?.message || errMsg
        } catch { /* use status code message */ }
        throw new Error(errMsg)
      }

      const blueprint = await res.json()

      // Dual-write: Supabase + localStorage via the storage service
      try {
        const { saveBlueprint } = await import('@/lib/supabaseStorage')
        await saveBlueprint(blueprint, orgId)
      } catch {
        // Supabase unavailable — fall back to localStorage only
        try { localStorage.setItem('aivory_blueprint', JSON.stringify(blueprint)) } catch { /* ignore */ }
      }

      setBlueprintState({ status: 'done' })
      // Small delay so the user sees the success state before navigating
      setTimeout(() => router.push('/blueprint'), 800)
    } catch (err: unknown) {
      const isAbort = err instanceof Error && err.name === 'AbortError'
      setBlueprintState({
        status: 'error',
        message: isAbort
          ? 'Blueprint generation timed out. Please try again.'
          : err instanceof Error ? err.message : 'Blueprint generation failed',
      })
    }
  }

  // Bug 1 fix: derive currency from context, never hardcode IDR
  const currencyCode: CurrencyCode = parseCurrencyCode(context.currency)
  const fmtCurrency = (v: number | null | undefined) => formatCurrency(v, currencyCode)

  // Bug 1 fix: support both new *Local field names and legacy *IDR names from
  // stored DiagnosticContext objects that were saved before this fix was deployed.
  const totalAnnualSavingsLocal =
    calculations.totalAnnualSavingsLocal ?? calculations.totalAnnualSavingsIDR ?? null
  const annualLaborSavingsLocal =
    calculations.annualLaborSavingsLocal ?? calculations.annualLaborSavingsIDR ?? null
  const annualProcessSavingsLocal =
    calculations.annualProcessSavingsLocal ?? calculations.annualProcessSavingsIDR ?? null
  const costOfInaction90DaysLocal =
    calculations.costOfInaction90DaysLocal ?? calculations.costOfInaction90DaysIDR ?? null

  const highRiskCount = risks.filter(r => r.severity === 'HIGH').length
  const quickWinCount = opportunities.filter(o => o.quadrant === 'quick_win').length

  // Assessment broken into individual bullet lines matching the screenshot
  const assessmentBullets: { icon: string; color: string; text: string }[] = [
    { icon: '▲', color: '#00e59e', text: `${context.company} scores ${scores.composite}/100, placing it at ${scores.maturityLevel} maturity.` },
    { icon: '▲', color: '#00e59e', text: `Strongest dimension: ${humanizeDimensionKey(scores.strongestDimension)}.` },
    { icon: '▽', color: '#fbbf24', text: `Greatest gap: ${humanizeDimensionKey(scores.weakestDimension)}.` },
    { icon: '▽', color: '#fbbf24', text: `${highRiskCount} high-severity risk${highRiskCount !== 1 ? 's' : ''} identified.` },
    { icon: '▶', color: '#00e59e', text: `${quickWinCount} quick-win opportunit${quickWinCount !== 1 ? 'ies' : 'y'} available.` },
  ]

  const sortedRisks = [...risks].sort((a, b) => {
    const order = { HIGH: 0, MEDIUM: 1, LOW: 2 }
    return order[a.severity] - order[b.severity]
  })

  function qualVal(v: string | string[] | undefined): string {
    if (!v) return 'Not provided'
    if (Array.isArray(v)) return v.length > 0 ? v.join(', ') : 'Not provided'
    return v.trim() || 'Not provided'
  }

  return (
    <div className={styles.page}>
      <HeaderBar company={context.company} submittedAt={context.submittedAt} />

      <div className={styles.content}>

        {/* ── Executive Scorecard ── */}
        <div className={styles.card}>
          <h2 className={styles.sectionTitle}>Executive Scorecard</h2>

          {/* Top row: ScoreRing | RadarChart */}
          <div className={styles.scorecardTopRow}>
            <div className={styles.scorecardRingCol}>
              <ScoreRing score={scores.composite} maturityLevel={scores.maturityLevel} />
            </div>
            <div className={styles.scorecardChartCol}>
              <RadarChart scores={scores} />
            </div>
          </div>

          {/* Bottom row: Strongest/Weakest | Assessment bullets */}
          <div className={styles.scorecardBottomRow}>
            {/* Left: Strongest + Weakest with colored underline bars */}
            <div className={styles.summaryRow}>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>Strongest</span>
                <span className={styles.summaryValue}>{humanizeDimensionKey(scores.strongestDimension)}</span>
                <span className={styles.summaryBar} style={{ background: '#00e59e' }} />
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>Weakest</span>
                <span className={styles.summaryValue}>{humanizeDimensionKey(scores.weakestDimension)}</span>
                <span className={styles.summaryBar} style={{ background: '#fbbf24' }} />
              </div>
            </div>

            {/* Right: bullet list with colored triangle icons */}
            <ul className={styles.assessmentList}>
              {assessmentBullets.map((b, i) => (
                <li key={i} className={styles.assessmentItem}>
                  <span className={styles.assessmentIcon} style={{ color: b.color }}>{b.icon}</span>
                  <span className={styles.assessmentText}>{b.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ── ROI Projection ── */}
        <div className={styles.card}>
          <h2 className={styles.sectionTitle}>ROI Projection</h2>

          {!calculations.hasEnoughDataForProjection && (
            <div className={styles.confidenceBanner}>
              <p className={styles.confidenceHeadline}>{calculations.confidenceLevel} confidence projection</p>
              <p className={styles.confidenceBody}>
                These projections are based on limited input data and may not reflect actual outcomes.
              </p>
              {calculations.missingInputs.length > 0 && (
                <p className={styles.missingInputs}>
                  Missing inputs: {calculations.missingInputs.join(', ')}
                </p>
              )}
            </div>
          )}

          <div className={styles.roiGrid}>
            <ROIMetricTile label="Total Annual Savings" value={totalAnnualSavingsLocal} formatter={fmtCurrency} />
            <ROIMetricTile label="Annual Labor Savings" value={annualLaborSavingsLocal} formatter={fmtCurrency} />
            <ROIMetricTile label="Annual Process Savings" value={annualProcessSavingsLocal} formatter={fmtCurrency} />
            <ROIMetricTile
              label="Hours Reclaimed / Year"
              value={calculations.hoursReclaimedPerYear}
              formatter={(v) => `${Math.round(v).toLocaleString('en-US')} hours`}
            />
            <ROIMetricTile label="Payback Period" value={calculations.paybackMonths} formatter={formatMonths} />
            <ROIMetricTile
              label="3-Year ROI"
              value={calculations.threeYearROIPercent}
              formatter={(v) => v >= 999 ? '>999%' : formatPercent(v)}
            />
            <ROIMetricTile
              label="Cost of Inaction (90 days)"
              value={costOfInaction90DaysLocal}
              formatter={fmtCurrency}
              subtitle={
                qualitative.annualRevenue?.toLowerCase().includes('pre-revenue')
                  ? 'Estimated opportunity cost if delayed'
                  : 'Revenue at risk if delayed'
              }
            />
          </div>
        </div>

        {/* ── Opportunity Priority Matrix ── */}
        <div className={styles.card}>
          <h2 className={styles.sectionTitle}>Opportunity Priority Matrix</h2>
          {opportunities.length === 0 ? (
            <p className={styles.emptyMessage}>No opportunities identified.</p>
          ) : (
            <div className={styles.matrixLayout}>
              <OpportunityMatrix
                opportunities={opportunities}
                highlightedId={highlightedId}
                onDotClick={(id) => setHighlightedId(prev => prev === id ? null : id)}
              />
              <div className={styles.opportunityList}>
                {opportunities.map((opp, idx) => (
                  <OpportunityCard
                    key={opp.id}
                    opportunity={opp}
                    isHighlighted={opp.id === highlightedId}
                    colorIndex={idx}
                    currencyCode={currencyCode}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Risk Register ── */}
        <div className={styles.card}>
          <h2 className={styles.sectionTitle}>Risk Register</h2>
          {sortedRisks.length === 0 ? (
            <p className={styles.emptyMessage}>No risks detected.</p>
          ) : (
            <div className={styles.riskList}>
              {sortedRisks.map(risk => (
                <RiskCard key={risk.id} risk={risk} />
              ))}
            </div>
          )}
        </div>

        {/* ── Diagnostic Context — 2-column free-flow ── */}
        <div className={styles.card}>
          <h2 className={styles.sectionTitle}>Diagnostic Context</h2>
          <div className={styles.contextColumns}>

            {/* Left column */}
            <div className={styles.contextCol}>
              <div className={styles.contextItem}>
                <span className={styles.contextLabel}>Primary Objective</span>
                <span className={`${styles.contextValue} ${!qualitative.primaryObjective ? styles.notProvided : ''}`}>
                  {qualVal(qualitative.primaryObjective)}
                </span>
              </div>
              <div className={styles.contextItem}>
                <span className={styles.contextLabel}>Compliance</span>
                {qualitative.compliance && qualitative.compliance.length > 0 ? (
                  <span className={styles.contextValueBullet}>
                    <span className={styles.contextBulletIcon}>▶</span>
                    <span className={styles.contextValue}>{qualVal(qualitative.compliance)}</span>
                  </span>
                ) : (
                  <span className={`${styles.contextValue} ${styles.notProvided}`}>Not provided</span>
                )}
              </div>
              <div className={styles.contextItem}>
                <span className={styles.contextLabel}>AI Capability</span>
                <span className={`${styles.contextValue} ${!qualitative.aiCapability ? styles.notProvided : ''}`}>
                  {qualVal(qualitative.aiCapability)}
                </span>
              </div>
              <div className={styles.contextItem}>
                <span className={styles.contextLabel}>Prior AI Attempts</span>
                <span className={`${styles.contextValue} ${!qualitative.priorAIAttempts ? styles.notProvided : ''}`}>
                  {qualVal(qualitative.priorAIAttempts)}
                </span>
              </div>
              <div className={styles.contextItem}>
                <span className={styles.contextLabel}>Delay Consequence</span>
                <span className={`${styles.contextValue} ${!qualitative.delayConsequence ? styles.notProvided : ''}`}>
                  {qualVal(qualitative.delayConsequence)}
                </span>
              </div>
              <div className={styles.contextItem}>
                <span className={styles.contextLabel}>Data Residency</span>
                <span className={`${styles.contextValue} ${!qualitative.dataResidency ? styles.notProvided : ''}`}>
                  {qualVal(qualitative.dataResidency)}
                </span>
              </div>
            </div>

            {/* Right column */}
            <div className={styles.contextCol}>
              <div className={styles.contextItem}>
                <span className={styles.contextLabel}>Top Pain Points</span>
                {qualitative.topPainPoints ? (
                  <ul className={styles.contextBulletList}>
                    {qualVal(qualitative.topPainPoints)
                      .split(/\d+\.\s+/)
                      .filter(s => s.trim())
                      .map((point, i) => (
                        <li key={i} className={styles.contextBulletItem}>
                          <span className={styles.contextBulletIcon}>▶</span>
                          <span className={styles.contextValue}>{point.trim()}</span>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <span className={`${styles.contextValue} ${styles.notProvided}`}>Not provided</span>
                )}
              </div>
              <div className={styles.contextItem}>
                <span className={styles.contextLabel}>Implementation Approach</span>
                <span className={`${styles.contextValue} ${!qualitative.implementApproach ? styles.notProvided : ''}`}>
                  {qualVal(qualitative.implementApproach)}
                </span>
              </div>
              <div className={styles.contextItem}>
                <span className={styles.contextLabel}>Leadership Alignment</span>
                <span className={`${styles.contextValue} ${!qualitative.leadershipAlignment ? styles.notProvided : ''}`}>
                  {qualVal(qualitative.leadershipAlignment)}
                </span>
              </div>
              <div className={styles.contextItem}>
                <span className={styles.contextLabel}>Resistance Sources</span>
                <span className={`${styles.contextValue} ${!qualitative.resistanceSources || qualitative.resistanceSources.length === 0 ? styles.notProvided : ''}`}>
                  {qualVal(qualitative.resistanceSources)}
                </span>
              </div>
              <div className={styles.contextItem}>
                <span className={styles.contextLabel}>Error Tolerance</span>
                <span className={`${styles.contextValue} ${!qualitative.errorTolerance ? styles.notProvided : ''}`}>
                  {qualVal(qualitative.errorTolerance)}
                </span>
              </div>
            </div>

          </div>
        </div>

        {/* ── Generate Blueprint CTA ── */}
        <div className={styles.blueprintCta}>
          <div className={styles.blueprintCtaLeft}>
            <div className={styles.blueprintCtaIcon} aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
            </div>
            <div>
              <p className={styles.blueprintCtaTitle}>Generate AI Blueprint</p>
              <p className={styles.blueprintCtaDesc}>
                Turn this diagnostic into a full AI implementation roadmap — architecture, workflows, and deployment plan tailored to {context.company}.
              </p>
            </div>
          </div>

          <div className={styles.blueprintCtaRight}>
            {blueprintState.status === 'error' && (
              <p className={styles.blueprintCtaError}>{blueprintState.message}</p>
            )}
            {blueprintState.status === 'done' ? (
              <button className={`${styles.blueprintBtn} ${styles.blueprintBtnDone}`} disabled>
                ✓ Blueprint ready — redirecting…
              </button>
            ) : (
              <button
                className={styles.blueprintBtn}
                onClick={handleGenerateBlueprint}
                disabled={blueprintState.status === 'generating'}
              >
                {blueprintState.status === 'generating' ? (
                  <>
                    <span className={styles.blueprintSpinner} aria-hidden="true" />
                    Generating blueprint…
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                    </svg>
                    Generate Blueprint
                  </>
                )}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
