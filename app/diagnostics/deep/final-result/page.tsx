'use client'

import { useState, useEffect } from 'react'
import { ArrowRight } from 'lucide-react'
import { useRouter } from 'next/navigation'
import type { DiagnosticContext } from '@/types/diagnostic'
import { upgradeDiagnosticContext, DeepDiagnosticService, maturityFromScore, getROISensitivity } from '@/services/deepDiagnostic'
import HeaderBar from '@/components/result/HeaderBar'
import ScoreRing from '@/components/result/ScoreRing'
import RadarChart from '@/components/result/RadarChart'
import DimensionBenchmarkBars from '@/components/result/DimensionBenchmarkBars'
import DimensionDrivers from '@/components/result/DimensionDrivers'
import HistorySparkline from '@/components/result/HistorySparkline'
import ROIMetricTile from '@/components/result/ROIMetricTile'
import ROISensitivityTornado from '@/components/result/ROISensitivityTornado'
import EfficiencyWhatIfSlider from '@/components/result/EfficiencyWhatIfSlider'
import OpportunityMatrix from '@/components/result/OpportunityMatrix'
import OpportunityCard from '@/components/result/OpportunityCard'
import RiskCard from '@/components/result/RiskCard'
import LoadingState from '@/components/result/LoadingState'
import ErrorCard from '@/components/result/ErrorCard'
import PrintableReport from '@/components/result/PrintableReport'
import SectionNavRail from '@/components/result/SectionNavRail'
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
import { getIndustryBenchmark, formatVsMedian } from '@/lib/industryBenchmarks'
import { computeDelta, compositeSeries } from '@/lib/diagnosticHistory'
import type { DiagnosticHistoryEntry } from '@/types/diagnostic'
import {
  buildVerdictNarrative,
  buildFirstMoves,
  buildLeadershipClause,
  buildExecutiveSummary,
  buildExecutiveInsight,
  buildAiEnablement,
  DIM_CONSEQUENCE_CHAINS,
  DIM_LABELS,
} from '@/lib/readinessNarrative'
import { quantifyPainPoints, formatPainPointHours } from '@/lib/bottleneckQuantification'
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
  // Phase E1.3/E2.3 — assessment history for the delta chip + sparkline.
  // Defaults to [] so signed-out/no-history/fetch-failure all render
  // identically to "nothing to show" without any extra loading state.
  const [history, setHistory] = useState<DiagnosticHistoryEntry[]>([])

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

      // organizationId omitted → the service derives the signed-in user's id
      await DeepDiagnosticService.generateBlueprint(
        diagnosticId,
        undefined,
        diagnosticData.qualitative?.primaryObjective || 'Business operations improvement',
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

  // Phase E1.3 — fetch history independently of the main context load; it's
  // a secondary signal (delta chip + sparkline), so it must never block or
  // gate rendering of the primary report. Signed-out/error → stays [].
  useEffect(() => {
    let cancelled = false
    import('@/lib/reportStorage')
      .then(({ loadDiagnosticHistory }) => loadDiagnosticHistory())
      .then((entries) => { if (!cancelled) setHistory(entries) })
      .catch(() => { /* already degrades to [] inside loadDiagnosticHistory */ })
    return () => { cancelled = true }
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
      // Try the per-user Postgres row first (keyed by the signed-in user's
      // JWT inside reportStorage), fall back to localStorage
      let raw: string | null = null
      try {
        const { loadDiagnosticContext } = await import('@/lib/reportStorage')
        const remoteCtx = await loadDiagnosticContext()
        if (remoteCtx) {
          const context = validateContext(remoteCtx)
          if (context) {
            setState({ status: 'loaded', context: upgradeDiagnosticContext(context, findIndustryHint()) })
            return
          }
        }
      } catch {
        // Server storage unavailable — fall through to localStorage
      }

      // localStorage fallback
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
      // the entire Business Operations Analysis section the user sees on this page.
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

  // Phase E1.4 — tornado-chart sensitivity data. Pure, display-only
  // re-evaluation of calculateROI at the efficiency factor's scenario
  // bounds; never touches `context.calculations`.
  const roiSensitivity = getROISensitivity(context)

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

  // Phase E1.1 — industry benchmark overlay (pure display, no score change).
  // null when qualitative.industry is missing/unrecognized — every consumer
  // below must degrade gracefully to the pre-Phase-E layout in that case.
  const industryBenchmark = getIndustryBenchmark(qualitative.industry)

  // Phase E1.3/E2.3 — history-derived delta chip + sparkline. Both are null/
  // empty (and therefore invisible) for signed-out users, users with fewer
  // than 2 saved assessments, or a flat composite score — see
  // lib/diagnosticHistory.ts for the exact gating.
  const historyDelta = computeDelta(history)
  const historySeries = compositeSeries(history)
  const compositeVsMedian = industryBenchmark
    ? formatVsMedian(displayScores.composite, industryBenchmark.composite)
    : null

  // Executive Operational Diagnosis — identical strings to the PDF (shared builders in
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

  // Executive Summary (section 1) + Executive Insights (per-section closers)
  // + AI Enablement (section 10) — identical builders/strings to the PDF.
  const topOpportunityTitle = opportunities[0]?.title ?? null
  const businessValueLabel = totalAnnualSavingsLocal != null ? fmtLocal(totalAnnualSavingsLocal) : null
  const executiveSummary = buildExecutiveSummary({
    company: context.company || 'Your organization',
    composite: displayScores.composite,
    maturityLevel: displayScores.maturityLevel,
    weakestKey: scores.weakestDimension,
    weakestScore: dimScoreOf(scores.weakestDimension),
    strongestKey: scores.strongestDimension,
    strongestScore: dimScoreOf(scores.strongestDimension),
    businessValueLabel,
    topOpportunityTitle,
  })
  const weakestConsequenceChain = DIM_CONSEQUENCE_CHAINS[scores.weakestDimension] ?? null
  const diagnosisInsight = buildExecutiveInsight('diagnosis', { weakestKey: scores.weakestDimension })
  const topOpportunity = opportunities[0] ?? null
  const opportunitiesInsight = buildExecutiveInsight('opportunities', {
    topOpportunityTitle: topOpportunity?.title ?? null,
    topOpportunityTimeToValueWeeks: topOpportunity?.timeToValueWeeks ?? null,
    topOpportunityDataReadiness: topOpportunity?.dataReadiness ?? null,
  })
  const financialInsight = buildExecutiveInsight('financial', {
    hasBudgetInput: (calculations.assumedBudgetMidpointLocal ?? (calculations as any).assumedBudgetMidpointUSD) != null,
    paybackMonths: calculations.paybackMonths,
    threeYearROIPercent: calculations.threeYearROIPercent,
  })
  const topImprovement = Array.isArray(context.roomForImprovement) && context.roomForImprovement.length > 0
    ? context.roomForImprovement[0] : null
  const improvementsInsight = buildExecutiveInsight('improvements', {
    topImprovementTitle: topImprovement?.title ?? null,
    topImprovementAction: topImprovement?.recommendedAction ?? null,
  })
  const aiEnablement = buildAiEnablement({
    topOpportunityTitle,
    weakestLabel: DIM_LABELS[scores.weakestDimension] ?? scores.weakestDimension,
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

  // Phase E2.5 — sticky section nav rail. Mirrors the section order below;
  // the "Improvement Priorities" entry is only included when that card
  // actually renders, so the rail never points at a missing anchor.
  const hasImprovementPriorities =
    Array.isArray(context.roomForImprovement) && context.roomForImprovement.length > 0
  const navSections = [
    { id: 'section-executive-summary', label: 'Executive Summary' },
    { id: 'section-operational-health', label: 'Operational Health' },
    { id: 'section-executive-diagnosis', label: 'Diagnosis' },
    { id: 'section-operations-analysis', label: 'Operations Analysis' },
    { id: 'section-operational-constraints', label: 'Constraints' },
    { id: 'section-transformation-opportunities', label: 'Opportunities' },
    { id: 'section-financial-case', label: 'Financial Case' },
    ...(hasImprovementPriorities ? [{ id: 'section-improvement-priorities', label: 'Priorities' }] : []),
    { id: 'section-business-context', label: 'Business Context' },
    { id: 'section-ai-enablement', label: 'AI Enablement' },
  ]

  return (
    <div className={styles.page}>
      <div className={styles.reportRow}>
      <div className={styles.content} id="diagnostic-report">
        <HeaderBar
          company={context.company}
          submittedAt={context.submittedAt}
          onDownloadPdf={handleDownloadPdf}
          isExportingPdf={isExportingPdf}
          delta={historyDelta}
        />

        {/* ── Executive Summary ── */}
        <div id="section-executive-summary" className={`${styles.card} ${styles.executiveSummaryCard}`}>
          <h2 className={styles.sectionLabel}>Executive Summary</h2>
          <p className={styles.executiveSummaryText}>{executiveSummary}</p>
        </div>

        {/* ── Operational Health ── */}
        <div id="section-operational-health" className={styles.card}>
          <h2 className={styles.sectionLabel}>Operational Health</h2>

          {/* Top row: ScoreRing | RadarChart */}
          <div className={styles.scorecardTopRow}>
            <div className={styles.scorecardRingCol}>
              <ScoreRing score={displayScores.composite} maturityLevel={displayScores.maturityLevel} />
              {compositeVsMedian && (
                <p className={styles.compositeBenchmarkCaption}>
                  {compositeVsMedian}
                  <br />
                  <span className={styles.compositeBenchmarkDisclaimer}>Directional benchmark, not a measured statistic.</span>
                </p>
              )}
              <HistorySparkline series={historySeries} />
            </div>
            <div className={styles.scorecardChartCol}>
              <RadarChart scores={scores} benchmark={industryBenchmark} />
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

          <DimensionBenchmarkBars scores={scores} benchmark={industryBenchmark} />
          <DimensionDrivers scoreDrivers={context.scoreDrivers} />
        </div>

        {/* ── Executive Operational Diagnosis — same narrative the PDF renders ── */}
        <div id="section-executive-diagnosis" className={styles.card}>
          <h2 className={styles.sectionLabel}>Executive Operational Diagnosis</h2>
          <p className={styles.verdictNarrative}>{verdictNarrative}</p>
          {weakestConsequenceChain && (
            <div className={styles.consequenceChain}>
              {weakestConsequenceChain.map((step, i) => (
                <span key={i} style={{ display: 'contents' }}>
                  {i > 0 && <span className={styles.consequenceChainArrow}>→</span>}
                  <span className={styles.consequenceChainStep}>{step}</span>
                </span>
              ))}
            </div>
          )}
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
          <div className={styles.executiveInsight}>
            <span className={styles.executiveInsightLabel}>Executive Insight</span>
            {diagnosisInsight}
          </div>
        </div>

        {/* ── Business Operations Analysis (model-generated; numbers stay deterministic) ── */}
        <div id="section-operations-analysis" className={styles.card}>
          <h2 className={styles.sectionLabel}>Business Operations Analysis</h2>
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
                      <h3 className={styles.aiColLabel}>Transformation opportunities</h3>
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
              Business operations analysis was unavailable for this submission. The scores and projections
              in this report are calculated directly from your answers.
            </p>
          )}
        </div>

        {/* ── Operational Constraints (was Risk Register) ── */}
        <div id="section-operational-constraints" className={styles.card}>
          <h2 className={styles.sectionLabel}>Operational Constraints</h2>
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

        {/* ── Transformation Opportunities ── */}
        <div id="section-transformation-opportunities" className={styles.card}>
          <h2 className={styles.sectionLabel}>Transformation Opportunities</h2>
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
          <div className={styles.executiveInsight}>
            <span className={styles.executiveInsightLabel}>Executive Insight</span>
            {opportunitiesInsight}
          </div>
        </div>

        {/* ── Financial Case ── */}
        <div id="section-financial-case" className={styles.card}>
          <h2 className={styles.sectionLabel}>Financial Case</h2>

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
            <ROIMetricTile label="Business Value Created" value={totalAnnualSavingsLocal} formatter={fmtLocal} confidenceLevel={calculations.confidenceLevel} />
            <ROIMetricTile label="Recovered Labor Value" value={annualLaborSavingsLocal} formatter={fmtLocal} confidenceLevel={calculations.confidenceLevel} />
            <ROIMetricTile label="Process Efficiency Value" value={annualProcessSavingsLocal} formatter={fmtLocal} confidenceLevel={calculations.confidenceLevel} />
            <ROIMetricTile
              label="Recovered Team Capacity"
              value={calculations.hoursReclaimedPerYear}
              formatter={(v) => `${Math.round(v).toLocaleString('en-US')} hours`}
              confidenceLevel={calculations.confidenceLevel}
            />
            <ROIMetricTile label="Payback Period" value={calculations.paybackMonths} formatter={formatMonths} confidenceLevel={calculations.confidenceLevel} />
            <ROIMetricTile
              label="3-Year ROI"
              value={calculations.threeYearROIPercent}
              formatter={(v) => v >= 999 ? '>999%' : formatPercent(v)}
              confidenceLevel={calculations.confidenceLevel}
            />
            <ROIMetricTile label="3-Year NPV" value={(calculations as any).npv3YearLocal ?? null} formatter={fmtLocal} subtitle="Net present value @ 10% discount" confidenceLevel={calculations.confidenceLevel} />
            <ROIMetricTile label="Annual Ongoing Cost" value={(calculations as any).annualOngoingCostLocal ?? null} formatter={fmtLocal} subtitle="Est. licenses, maintenance & support" confidenceLevel={calculations.confidenceLevel} />
            <ROIMetricTile label="Net Annual Savings" value={(calculations as any).netAnnualSavingsLocal ?? null} formatter={fmtLocal} subtitle="After ongoing cost" confidenceLevel={calculations.confidenceLevel} />
            <ROIMetricTile label="Net Payback Period" value={(calculations as any).netPaybackMonths ?? null} formatter={formatMonths} subtitle="On net savings" confidenceLevel={calculations.confidenceLevel} />
            <ROIMetricTile
              label="Operational Cost of Delay (90 days)"
              value={costOfInaction90DaysLocal}
              formatter={fmtLocal}
              subtitle={
                qualitative.annualRevenue?.toLowerCase().includes('pre-revenue')
                  ? 'Estimated opportunity cost if delayed'
                  : 'Revenue at risk if delayed'
              }
              confidenceLevel={calculations.confidenceLevel}
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
            <ROISensitivityTornado
              sensitivity={roiSensitivity}
              baseValueLocal={totalAnnualSavingsLocal}
              baseBoundLabel={`${Math.round((calculations.efficiencyFactor ?? 0.75) * 100)}%`}
              formatter={fmtLocal}
            />
          )}

          {calculations.hasEnoughDataForProjection && (
            <EfficiencyWhatIfSlider
              context={context}
              calculations={calculations}
              fmtLocal={fmtLocal}
              formatMonths={formatMonths}
              formatPercent={formatPercent}
            />
          )}

          {calculations.hasEnoughDataForProjection && (
            <div className={styles.assumptionsNote}>
              <p className={styles.assumptionsTitle}>How these figures were calculated</p>
              <ul className={styles.assumptionsList}>
                <li className={styles.stepRow}>
                  <span className={styles.stepLabel}>Step 1 — Recovered team capacity/year</span>
                  <span className={styles.stepValue}>
                    {calculations.hoursReclaimedPerYear} hrs
                    {' = '}manual hours/week × 52 weeks × automation gap × {Math.round((calculations.efficiencyFactor ?? 0.75) * 100)}% efficiency factor
                  </span>
                </li>
                <li className={styles.stepRow}>
                  <span className={styles.stepLabel}>Step 2 — Recovered labor value</span>
                  <span className={styles.stepValue}>
                    {fmtLocal(calculations.annualLaborSavingsLocal)} = {calculations.hoursReclaimedPerYear} hrs × <strong>{fmtLocal(calculations.assumedHourlyRateLocal)}/hr</strong>
                    {calculations.smallTeamRateApplied
                      ? ' (opportunity-cost rate for teams of 1–5 FTEs — 50% of industry blended rate)'
                      : ' (industry blended rate)'}
                  </span>
                </li>
                <li className={styles.stepRow}>
                  <span className={styles.stepLabel}>Step 3 — Process efficiency value</span>
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
                  <span className={styles.stepLabel}>Step 4 — Business value created</span>
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
          <div className={styles.executiveInsight}>
            <span className={styles.executiveInsightLabel}>Executive Insight</span>
            {financialInsight}
          </div>
        </div>

        {/* ── Operational Improvement Priorities ── */}
        {Array.isArray(context.roomForImprovement) && context.roomForImprovement.length > 0 && (
          <div id="section-improvement-priorities" className={styles.card}>
            <h2 className={styles.sectionLabel}>Operational Improvement Priorities</h2>
            <p className={styles.improvementIntro}>
              Prioritized areas to strengthen before and during AI adoption. These feed directly
              into your Transformation Blueprint.
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
            <div className={styles.executiveInsight}>
              <span className={styles.executiveInsightLabel}>Executive Insight</span>
              {improvementsInsight}
            </div>
          </div>
        )}

        {/* ── Business Context — 2-column free-flow ── */}
        <div id="section-business-context" className={styles.card}>
          <h2 className={styles.sectionLabel}>Business Context</h2>
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
              {/* Slice-2 optional answers — rendered only when provided so
                  contexts predating the questions look unchanged. */}
              {qualitative.processOwnership ? (
                <div className={styles.contextItem}>
                  <span className={styles.contextLabel}>Process Ownership</span>
                  <span className={styles.contextValue}>{qualVal(qualitative.processOwnership)}</span>
                </div>
              ) : null}
              {qualitative.kpiBaseline ? (
                <div className={styles.contextItem}>
                  <span className={styles.contextLabel}>Operational KPI Baselines</span>
                  <span className={styles.contextValue}>{qualVal(qualitative.kpiBaseline)}</span>
                </div>
              ) : null}
            </div>

            {/* Right column */}
            <div className={styles.contextCol}>
              <div className={styles.contextItem}>
                <span className={styles.contextLabel}>Top Pain Points</span>
                {qualitative.topPainPoints ? (
                  <ul className={styles.contextBulletList}>
                    {quantifyPainPoints({
                      topPainPoints: qualitative.topPainPoints,
                      painPointHours: qualitative.painPointHours,
                      hoursReclaimedPerYear: calculations.hoursReclaimedPerYear,
                      assumedHourlyRateLocal: calculations.assumedHourlyRateLocal,
                    }).map((item, i) => {
                      const hoursLabel = formatPainPointHours(item)
                      const costLabel = item.annualCostLocal != null ? fmtLocal(item.annualCostLocal) : null
                      return (
                        <li key={i} className={styles.contextBulletItem}>
                          <span className={styles.contextBulletIcon}>▶</span>
                          <span className={styles.contextValue}>
                            {item.label}
                            {hoursLabel ? (
                              <>
                                {' — '}
                                <span className={styles.contextBulletFigure}>{hoursLabel}</span>
                                {costLabel ? ` (~${costLabel}/yr)` : ''}
                              </>
                            ) : null}
                          </span>
                        </li>
                      )
                    })}
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

        {/* ── AI Enablement (closing section) ── */}
        <div id="section-ai-enablement" className={styles.card}>
          <h2 className={styles.sectionLabel}>AI Enablement</h2>
          <p className={styles.aiEnablementText}>{aiEnablement}</p>
        </div>

        {/* ── Generate Blueprint CTA ── */}
        <div className={styles.blueprintCta}>
          <div className={styles.blueprintCtaLeft}>
            <h2 className={styles.blueprintCtaTitle}>Next steps: Transformation Blueprint</h2>
            <p className={styles.blueprintCtaText}>
              With this diagnostic result, your Transformation Blueprint is ready to generate.
              Purchase the Blueprint + Transformation Roadmap to transform these insights into a deployment-ready architecture and actionable execution plan.
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

      <SectionNavRail sections={navSections} />
      </div>

      {/* Hidden printable layout for PDF generation */}
      <div id="pdf-print-layout" style={{ display: 'none' }}>
        <PrintableReport context={context} llmResult={llmResult ?? undefined} />
      </div>
    </div>
  )
}
