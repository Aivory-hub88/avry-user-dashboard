'use client'

import { useState, useEffect } from 'react'
import { ArrowRight } from 'lucide-react'
import { useRouter } from 'next/navigation'
import type { DiagnosticContext } from '@/types/diagnostic'
import { upgradeDiagnosticContext, DeepDiagnosticService, maturityFromScore } from '@/services/deepDiagnostic'
import HeaderBar from '@/components/result/HeaderBar'
import ScoreRing from '@/components/result/ScoreRing'
import RadarChart from '@/components/result/RadarChart'
import ROIMetricTile from '@/components/result/ROIMetricTile'
import OpportunityMatrix from '@/components/result/OpportunityMatrix'
import OpportunityCard from '@/components/result/OpportunityCard'
import RiskCard from '@/components/result/RiskCard'
import LoadingState from '@/components/result/LoadingState'
import ErrorCard from '@/components/result/ErrorCard'
import PrintableReport from '@/components/result/PrintableReport'
import { exportReportToPdf } from '@/lib/pdfExport'
import {
  formatLocalAmount,
  formatPercent,
  formatMonths,
  humanizeDimensionKey,
  parseCurrencyCode,
  type CurrencyCode,
} from '@/lib/resultFormatters'
import { ensureLiveRates, getFxAsOfLabel } from '@/lib/liveRates'
import { buildVerdictNarrative, buildFirstMoves, buildLeadershipClause } from '@/lib/readinessNarrative'
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

const fmtRoi = (v: number | null | undefined): string =>
  v == null ? 'N/A' : v >= 999 ? '>999%' : `${Math.round(v)}%`

export default function FinalResultPage() {
  const router = useRouter()
  const [state, setState] = useState<PageState>({ status: 'loading' })
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const [llmResult, setLlmResult] = useState<Record<string, any> | null>(null)

  const [isExportingPdf, setIsExportingPdf] = useState(false)
  const [isGeneratingBlueprint, setIsGeneratingBlueprint] = useState(false)

  const handleGenerateBlueprint = async () => {
    if (state.status !== 'loaded') {
      router.push('/blueprint')
      return
    }
    try {
      setIsGeneratingBlueprint(true)
      // Send the same blended composite the user sees on this page (70%
      // deterministic + 30% AI assessment) so the blueprint's
      // ai_readiness_score matches the on-screen report instead of the raw
      // deterministic composite. Also attach the AI analysis narrative so
      // blueprint generation can build on it.
      const llmScore =
        typeof (llmResult as any)?.score === 'number' ? (llmResult as any).score
        : typeof (llmResult as any)?.ai_readiness_score === 'number' ? (llmResult as any).ai_readiness_score
        : null
      const blendedComposite = llmScore != null
        ? Math.round(state.context.scores.composite * 0.7 + llmScore * 0.3)
        : state.context.scores.composite
      const diagnosticData = {
        ...state.context,
        scores: {
          ...state.context.scores,
          composite: blendedComposite,
          maturityLevel: llmScore != null ? maturityFromScore(blendedComposite) : state.context.scores.maturityLevel,
        },
        ...(llmResult ? {
          ai_analysis: {
            summary: (llmResult as any).summary ?? null,
            strengths: (llmResult as any).strengths ?? null,
            constraints: (llmResult as any).constraints ?? null,
            automation_opportunities: (llmResult as any).automation_opportunities ?? null,
            recommended_next_step: (llmResult as any).recommended_next_step ?? null,
          },
        } : {}),
      }
      const diagnosticId = (diagnosticData as any).id || 'current'

      await DeepDiagnosticService.generateBlueprint(
        diagnosticId,
        'demo_org',
        diagnosticData.qualitative?.primaryObjective || 'AI readiness improvement',
        diagnosticData
      )
      
      router.push('/blueprint')
    } catch (err) {
      console.error('Failed to generate blueprint:', err)
      alert('Failed to generate blueprint. Please try again.')
    } finally {
      setIsGeneratingBlueprint(false)
    }
  }

  useEffect(() => {
    try {
      setLlmResult(DeepDiagnosticService.loadResult() as unknown as Record<string, any> | null)
    } catch { /* AI analysis is optional — never block the report */ }
  }, [])

  useEffect(() => {
    const loadContext = async () => {
      const findIndustryHint = (): string | undefined => {
        try {
          const progress = DeepDiagnosticService.loadProgress()
          if (!progress?.phases) return undefined
          for (const phase of Object.values(progress.phases)) {
            const rec = phase as unknown as Record<string, unknown>
            if (rec && typeof rec === 'object' && typeof rec.industry === 'string') {
              return rec.industry
            }
          }
        } catch { /* ignore */ }
        return undefined
      }
      // Fetch live FX before upgradeDiagnosticContext may recompute ROI —
      // best-effort; the static snapshot is the fallback.
      await ensureLiveRates()
      // Try Supabase first (Req 6.5–6.8), fall back to localStorage
      let raw: string | null = null
      try {
        const { loadDiagnosticContext } = await import('@/lib/supabaseStorage')
        const supabaseCtx = await loadDiagnosticContext('demo_org')
        if (supabaseCtx) {
          const context = validateContext(supabaseCtx)
          if (context) {
            setState({ status: 'loaded', context: upgradeDiagnosticContext(context, findIndustryHint()) })
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
      setState({ status: 'loaded', context: upgradeDiagnosticContext(context, findIndustryHint()) })
    }
    loadContext()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (state.status === 'loading') return <LoadingState />
  if (state.status === 'error') return <ErrorCard message={state.message} />

  const { context } = state
  const { scores, calculations, opportunities, risks, qualitative } = context


  const handleDownloadPdf = async () => {
    setIsExportingPdf(true)
    try {
      // Pass the same blended scores shown on this page (70% deterministic +
      // 30% AI assessment) so the PDF's composite matches the on-screen one
      // instead of silently reverting to the raw deterministic score.
      // llmResult must be forwarded too — without it the PDF silently drops
      // the entire AI Analysis section the user sees on this page.
      await exportReportToPdf('pdf-print-layout', context.company, { ...context, scores: displayScores }, llmResult)
    } catch (error) {
      console.error('Failed to generate PDF', error)
    } finally {
      setIsExportingPdf(false)
    }
  }

  // Bug 1 fix: derive currency from context, never hardcode IDR.
  // The *Local calculation fields are ALREADY converted to the display
  // currency at compute time, so they must be formatted without a second
  // conversion — formatLocalAmount, not formatCurrency. (The old fmtCurrency
  // here multiplied by the FX rate again, inflating IDR figures 15,600×.)
  const currencyCode: CurrencyCode = parseCurrencyCode(context.currency)
  const fmtLocal = (v: number | null | undefined) => formatLocalAmount(v, currencyCode)

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
  const _llmScore =
    typeof (llmResult as any)?.score === 'number' ? (llmResult as any).score
    : typeof (llmResult as any)?.ai_readiness_score === 'number' ? (llmResult as any).ai_readiness_score
    : null
  const _blended = _llmScore != null ? Math.round(scores.composite * 0.7 + _llmScore * 0.3) : scores.composite
  const displayScores = _llmScore != null
    ? { ...scores, composite: _blended, maturityLevel: maturityFromScore(_blended) }
    : scores

  // Readiness Verdict — identical strings to the PDF (shared builders in
  // lib/readinessNarrative.ts), fed the same blended displayScores the PDF gets.
  const dimScoreOf = (k: string) => Math.round((scores as unknown as Record<string, number>)[k] ?? 0)
  const verdictNarrative = buildVerdictNarrative({
    company: context.company || 'Your organization',
    composite: displayScores.composite,
    maturityLevel: displayScores.maturityLevel,
    weakestKey: scores.weakestDimension,
    weakestScore: dimScoreOf(scores.weakestDimension),
    strongestKey: scores.strongestDimension,
    strongestScore: dimScoreOf(scores.strongestDimension),
  })
  const firstMoves = buildFirstMoves({
    firstImprovement: Array.isArray(context.roomForImprovement) && context.roomForImprovement.length > 0
      ? context.roomForImprovement[0] : null,
    topOpportunity: opportunities[0] ?? null,
    hasBudgetInput: (calculations.assumedBudgetMidpointLocal ?? (calculations as any).assumedBudgetMidpointUSD) != null,
    leadershipClause: buildLeadershipClause(qualitative.leadershipAlignment || ''),
  })

  const assessmentBullets: { icon: string; color: string; text: string }[] = [
    { icon: '▲', color: '#afd199', text: `Your company / organization scores ${displayScores.composite}/100, placing it at ${displayScores.maturityLevel} maturity.${_llmScore != null ? ' (composite blended 70% deterministic + 30% AI assessment)' : ''}` },
    { icon: '▲', color: '#afd199', text: `Strongest dimension: ${humanizeDimensionKey(scores.strongestDimension)}.` },
    { icon: '▽', color: '#fbbf24', text: `Greatest gap: ${humanizeDimensionKey(scores.weakestDimension)}.` },
    { icon: '▽', color: '#fbbf24', text: `${highRiskCount} high-severity risk${highRiskCount !== 1 ? 's' : ''} identified.` },
    { icon: '▶', color: '#afd199', text: `${quickWinCount} quick-win opportunit${quickWinCount !== 1 ? 'ies' : 'y'} available.` },
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
      <div className={styles.content} id="diagnostic-report">
        <HeaderBar 
          company={context.company} 
          submittedAt={context.submittedAt} 
          onDownloadPdf={handleDownloadPdf}
          isExportingPdf={isExportingPdf}
        />

        {/* ── Executive Scorecard ── */}
        <div className={styles.card}>
          <h2 className={styles.sectionLabel}>Executive Scorecard</h2>

          {/* Top row: ScoreRing | RadarChart */}
          <div className={styles.scorecardTopRow}>
            <div className={styles.scorecardRingCol}>
              <ScoreRing score={displayScores.composite} maturityLevel={displayScores.maturityLevel} />
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
                <span className={styles.summaryBar} style={{ background: '#afd199' }} />
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

        {/* ── Readiness Verdict — same narrative the PDF renders ── */}
        <div className={styles.card}>
          <h2 className={styles.sectionLabel}>Readiness Verdict</h2>
          <p className={styles.verdictNarrative}>{verdictNarrative}</p>
          <div className={styles.verdictMoves}>
            {firstMoves.map((move, i) => (
              <div key={i} className={styles.verdictMoveRow}>
                <span className={styles.verdictMoveNum}>{String(i + 1).padStart(2, '0')}</span>
                <div className={styles.verdictMoveBody}>
                  <span className={styles.verdictMoveTitle}>{move.title}</span>
                  <p className={styles.verdictMoveText}>{move.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── AI Analysis (model-generated; numbers stay deterministic) ── */}
        <div className={styles.card}>
          <h2 className={styles.sectionLabel}>AI Analysis</h2>
          {llmResult ? (
            <>
              {(llmResult.narrative_summary || llmResult.narrative) && (
                <p className={styles.aiNarrative}>
                  {llmResult.narrative_summary || llmResult.narrative}
                </p>
              )}
              <div className={styles.aiGrid}>
                {Array.isArray(llmResult.strengths) && llmResult.strengths.length > 0 && (
                  <div>
                    <h3 className={styles.aiColLabel}>Strengths</h3>
                    <ul className={styles.aiList}>
                      {llmResult.strengths.slice(0, 5).map((s: string, i: number) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {(() => {
                  const constraints = llmResult.primary_constraints ?? llmResult.blockers
                  return Array.isArray(constraints) && constraints.length > 0 ? (
                    <div>
                      <h3 className={styles.aiColLabel}>Primary constraints</h3>
                      <ul className={styles.aiList}>
                        {constraints.slice(0, 5).map((s: string, i: number) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null
                })()}
                {(() => {
                  const opps = llmResult.automation_opportunities ?? llmResult.opportunities
                  return Array.isArray(opps) && opps.length > 0 ? (
                    <div>
                      <h3 className={styles.aiColLabel}>Automation opportunities</h3>
                      <ul className={styles.aiList}>
                        {opps.slice(0, 5).map((s: string, i: number) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null
                })()}
              </div>
              {llmResult.recommended_next_step && (
                <p className={styles.aiNextStep}>
                  <strong>Recommended next step:</strong> {llmResult.recommended_next_step}
                </p>
              )}
            </>
          ) : (
            <p className={styles.aiUnavailable}>
              AI analysis was unavailable for this submission. The scores and projections
              in this report are calculated directly from your answers.
            </p>
          )}
        </div>

        {/* ── ROI Projection ── */}
        <div className={styles.card}>
          <h2 className={styles.sectionLabel}>ROI Projection</h2>

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
            <ROIMetricTile label="Total Annual Savings" value={totalAnnualSavingsLocal} formatter={fmtLocal} />
            <ROIMetricTile label="Annual Labor Savings" value={annualLaborSavingsLocal} formatter={fmtLocal} />
            <ROIMetricTile label="Annual Process Savings" value={annualProcessSavingsLocal} formatter={fmtLocal} />
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
            <ROIMetricTile label="3-Year NPV" value={(calculations as any).npv3YearLocal ?? null} formatter={fmtLocal} subtitle="Net present value @ 10% discount" />
            <ROIMetricTile label="Annual Ongoing Cost" value={(calculations as any).annualOngoingCostLocal ?? null} formatter={fmtLocal} subtitle="Est. licenses, maintenance & support" />
            <ROIMetricTile label="Net Annual Savings" value={(calculations as any).netAnnualSavingsLocal ?? null} formatter={fmtLocal} subtitle="After ongoing cost" />
            <ROIMetricTile label="Net Payback Period" value={(calculations as any).netPaybackMonths ?? null} formatter={formatMonths} subtitle="On net savings" />
            <ROIMetricTile
              label="Cost of Inaction (90 days)"
              value={costOfInaction90DaysLocal}
              formatter={fmtLocal}
              subtitle={
                qualitative.annualRevenue?.toLowerCase().includes('pre-revenue')
                  ? 'Estimated opportunity cost if delayed'
                  : 'Revenue at risk if delayed'
              }
            />
          </div>

          {(calculations as any).scenarioThreeYearROI && (
            <div className={styles.scenarioRow}>
              <span className={styles.scenarioLabel}>3-Year ROI range</span>
              <div className={styles.scenarioGrid}>
                <div className={`${styles.scenarioCell} ${styles.scenarioCellLow}`}>
                  <span className={styles.scenarioCellLabel}>Conservative</span>
                  <span className={styles.scenarioCellValue}>{fmtRoi((calculations as any).scenarioThreeYearROI.low)}</span>
                </div>
                <div className={`${styles.scenarioCell} ${styles.scenarioCellBase}`}>
                  <span className={styles.scenarioCellLabel}>Base</span>
                  <span className={styles.scenarioCellValue}>{fmtRoi((calculations as any).scenarioThreeYearROI.base)}</span>
                </div>
                <div className={`${styles.scenarioCell} ${styles.scenarioCellHigh}`}>
                  <span className={styles.scenarioCellLabel}>Optimistic</span>
                  <span className={styles.scenarioCellValue}>{fmtRoi((calculations as any).scenarioThreeYearROI.high)}</span>
                </div>
              </div>
              <span className={styles.scenarioNote}>Range reflects 50%–90% automation efficiency; base case uses {Math.round((calculations.efficiencyFactor ?? 0.75) * 100)}%.</span>
            </div>
          )}

          {calculations.hasEnoughDataForProjection && (
            <div className={styles.assumptionsNote}>
              <p className={styles.assumptionsTitle}>How these figures were calculated</p>
              <ul className={styles.assumptionsList}>
                <li className={styles.stepRow}>
                  <span className={styles.stepLabel}>Step 1 — Hours reclaimed/year</span>
                  <span className={styles.stepValue}>
                    {calculations.hoursReclaimedPerYear} hrs
                    {' = '}manual hours/week × 52 weeks × automation gap × {Math.round((calculations.efficiencyFactor ?? 0.75) * 100)}% efficiency factor
                  </span>
                </li>
                <li className={styles.stepRow}>
                  <span className={styles.stepLabel}>Step 2 — Labor savings</span>
                  <span className={styles.stepValue}>
                    {fmtLocal(calculations.annualLaborSavingsLocal)} = {calculations.hoursReclaimedPerYear} hrs × <strong>{fmtLocal(calculations.assumedHourlyRateLocal)}/hr</strong>
                    {calculations.smallTeamRateApplied
                      ? ' (opportunity-cost rate for teams of 1–5 FTEs — 50% of industry blended rate)'
                      : ' (industry blended rate)'}
                  </span>
                </li>
                <li className={styles.stepRow}>
                  <span className={styles.stepLabel}>Step 3 — Process savings</span>
                  <span className={styles.stepValue}>
                    {fmtLocal(calculations.annualProcessSavingsLocal)} = 20% of labor savings (operational overhead reduction — internal benchmark estimate)
                  </span>
                </li>
                <li className={styles.stepRow}>
                  <span className={styles.stepLabel}>Ongoing run cost</span>
                  <span className={styles.stepValue}>
                    {fmtLocal((calculations as any).annualOngoingCostLocal)} / year = {Math.round(((calculations as any).ongoingCostRate ?? 0.2) * 100)}% of the initial investment (licenses, maintenance, support). Net figures and payback are computed after this cost.
                  </span>
                </li>
                <li className={styles.stepRow}>
                  <span className={styles.stepLabel}>Currency &amp; sources</span>
                  <span className={styles.stepValue}>
                    FX rates as of {(calculations as any).fxAsOf ?? getFxAsOfLabel()} (auto-refreshed every 2 hours from live market data); the 75% efficiency factor and 20% process-overhead figure are internal benchmark estimates, not client-specific guarantees.
                  </span>
                </li>
                <li className={styles.stepRow}>
                  <span className={styles.stepLabel}>Step 4 — Total annual savings</span>
                  <span className={styles.stepValue}>
                    <strong>{fmtLocal(calculations.totalAnnualSavingsLocal)}</strong> = labor + process savings
                  </span>
                </li>
                {calculations.assumedBudgetMidpointLocal != null && (
                  <li className={styles.stepRow}>
                    <span className={styles.stepLabel}>Step 5 — Payback period</span>
                    <span className={styles.stepValue}>
                      {calculations.paybackMonths != null ? `${Math.round(calculations.paybackMonths)} months` : '—'}{' '}
                      = <strong>{fmtLocal(calculations.assumedBudgetMidpointLocal)}</strong> investment ÷ {fmtLocal(calculations.totalAnnualSavingsLocal)}/yr × 12
                      {' '}(midpoint of your selected budget range)
                    </span>
                  </li>
                )}
                {calculations.assumedBudgetMidpointLocal != null && (
                  <li className={styles.stepRow}>
                    <span className={styles.stepLabel}>Step 6 — 3-Year ROI</span>
                    <span className={styles.stepValue}>
                    <strong style={{ color: calculations.threeYearROIPercent != null && calculations.threeYearROIPercent < 0 ? '#f87171' : '#4ade80' }}>
                      {calculations.threeYearROIPercent != null ? `${calculations.threeYearROIPercent.toFixed(1)}%` : '—'}
                    </strong>
                    {' = '}({fmtLocal(calculations.totalAnnualSavingsLocal)}/yr × 3 − {fmtLocal(calculations.assumedBudgetMidpointLocal)}) ÷ {fmtLocal(calculations.assumedBudgetMidpointLocal)} × 100
                    </span>

                    {calculations.threeYearROIPercent != null && calculations.threeYearROIPercent < 0 && calculations.totalAnnualSavingsLocal != null && calculations.assumedBudgetMidpointLocal != null && (() => {
                      const savings3yr = calculations.totalAnnualSavingsLocal! * 3
                      const budget = calculations.assumedBudgetMidpointLocal!
                      const shortfall = budget - savings3yr
                      const breakEvenYears = budget / calculations.totalAnnualSavingsLocal!
                      const savingsNeededPerYear = budget / 3
                      return (
                        <ul className={styles.roiNegativeList}>
                          <li className={styles.roiNegativeReason}>
                            <span className={styles.roiNegativeLabel}>⚠ Why negative?</span>
                            Your 3-year cumulative savings (<strong>{fmtLocal(savings3yr)}</strong>) fall{' '}
                            <strong style={{ color: '#f87171' }}>{fmtLocal(shortfall)} short</strong>{' '}
                            of the full investment ({fmtLocal(budget)}). Break-even is at{' '}
                            <strong>~{breakEvenYears.toFixed(1)} years</strong>, not 3.
                          </li>
                          <li className={styles.roiFixItem}>
                            <span className={styles.roiFixLabel}>Fix A — Reduce initial budget scope</span>
                            Start with a budget of <strong>{fmtLocal(savings3yr)}</strong> or less.
                            That amount is fully recovered by year 3 at your current saving rate.
                          </li>
                          <li className={styles.roiFixItem}>
                            <span className={styles.roiFixLabel}>Fix B — Increase automation depth</span>
                            Automate more hours or close a larger automation gap to push annual savings to at least{' '}
                            <strong>{fmtLocal(savingsNeededPerYear)}/yr</strong> (currently {fmtLocal(calculations.totalAnnualSavingsLocal)}/yr).
                          </li>
                        </ul>
                      )
                    })()}

                    {calculations.threeYearROIPercent != null && calculations.threeYearROIPercent >= 0 &&
                      <span style={{ color: '#86efac', gridColumn: '2' }}>✓ Fully recovered within 3 years.</span>
                    }
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>

        {/* ── Opportunity Priority Matrix ── */}
        <div className={styles.card}>
          <h2 className={styles.sectionLabel}>Opportunity Priority Matrix</h2>
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
          <h2 className={styles.sectionLabel}>Risk Register</h2>
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
          <h2 className={styles.sectionLabel}>Diagnostic Context</h2>
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
                    {(() => {
                      // Numbered lists split on "1. "; free-text answers fall
                      // back to comma separation so they still render as bullets.
                      const text = qualVal(qualitative.topPainPoints)
                      return /\d+\.\s+/.test(text) ? text.split(/\d+\.\s+/) : text.split(/,\s*/)
                    })()
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

        {/* ── Room for Improvement ── */}
        {Array.isArray(context.roomForImprovement) && context.roomForImprovement.length > 0 && (
          <div className={styles.card}>
            <h2 className={styles.sectionLabel}>Room for Improvement</h2>
            <p className={styles.improvementIntro}>
              Prioritized areas to strengthen before and during AI adoption. These feed directly
              into your AI System Blueprint.
            </p>
            <div className={styles.improvementList}>
              {context.roomForImprovement.map((item) => (
                <div key={item.id} className={styles.improvementItem}>
                  <div className={styles.improvementHeader}>
                    <span className={styles.improvementTitle}>{item.title}</span>
                    <span className={`${styles.improvementBadge} ${styles[`priority_${item.priority}`]}`}>
                      {item.priority} priority
                    </span>
                    <span className={styles.improvementArea}>{item.area}</span>
                  </div>
                  <div className={styles.improvementBody}>
                    <p className={styles.improvementField}>
                      <span className={styles.improvementFieldLabel}>What to improve</span>
                      {item.recommendedAction}
                    </p>
                    <p className={styles.improvementField}>
                      <span className={styles.improvementFieldLabel}>Operational impact</span>
                      {item.operationalImpact}
                    </p>
                  </div>
                  <div className={styles.beforeAfter}>
                    <div className={`${styles.baCell} ${styles.baBefore}`}>
                      <span className={styles.baLabel}>Before</span>
                      <span className={styles.baText}>{item.before}</span>
                    </div>
                    <div className={styles.baArrow} aria-hidden="true">
                      <ArrowRight size={20} strokeWidth={2} />
                    </div>
                    <div className={`${styles.baCell} ${styles.baAfter}`}>
                      <span className={styles.baLabel}>After</span>
                      <span className={styles.baText}>{item.after}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Generate Blueprint CTA ── */}
        <div className={styles.blueprintCta}>
          <div className={styles.blueprintCtaLeft}>
            <h2 className={styles.blueprintCtaTitle}>Next steps: AI System Blueprint</h2>
            <p className={styles.blueprintCtaText}>
              With this diagnostic result, your AI System Blueprint is ready to generate.
              Purchase the Blueprint + AI Roadmap to transform these insights into a deployment-ready architecture and actionable execution plan.
            </p>
          </div>
          <div className={styles.blueprintCtaRight}>
            <button
              className={styles.generateBlueprintButton}
              onClick={handleGenerateBlueprint}
              disabled={isGeneratingBlueprint}
            >
              {isGeneratingBlueprint ? 'Generating...' : 'Generate Blueprint'}
            </button>
            <span className={styles.blueprintPrice}>$85 One time</span>
          </div>
        </div>

      </div>

      {/* Hidden printable layout for PDF generation */}
      <div id="pdf-print-layout" style={{ display: 'none' }}>
        <PrintableReport context={context} llmResult={llmResult ?? undefined} />
      </div>
    </div>
  )
}
