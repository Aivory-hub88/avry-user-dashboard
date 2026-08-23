'use client'

import { useState, useEffect, useRef } from 'react'
import { ArrowRight } from 'lucide-react'
import { useRouter } from 'next/navigation'
import type { DiagnosticContext } from '@/types/diagnostic'
import { upgradeDiagnosticContext, DeepDiagnosticService, maturityFromScore, getROISensitivity, humanizeAnswerId } from '@/services/deepDiagnostic'
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
import AdvisoryContactModal from '@/components/result/AdvisoryContactModal'
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
  buildDimensionSpreadCaption,
  buildOpportunityMatrixCaption,
  buildRoiTilesCaption,
  buildRiskRegisterCaption,
  buildFoldedConstraintNote,
  buildEvidenceUsed,
  buildConfidenceReasoning,
  maturityLevelLabel,
  DIM_CONSEQUENCE_CHAINS,
  DIM_LABELS,
  buildOperationalHealthPlainLanguage,
  GLOSSARY_TERMS,
  buildMethodologyIntro,
  buildFinancialTermsNote,
  buildConsequenceNarrative,
} from '@/lib/readinessNarrative'
import { quantifyPainPoints, formatPainPointHours, displayPainPointCost } from '@/lib/bottleneckQuantification'
import { useLocaleContext } from '@/hooks/useLocale'
import styles from './final-result.module.css'

function formatElapsed(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

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
  const { locale, setLocale } = useLocaleContext()
  const [state, setState] = useState<PageState>({ status: 'loading' })
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const [llmResult, setLlmResult] = useState<Record<string, any> | null>(null)
  // Phase E1.3/E2.3 — assessment history for the delta chip + sparkline.
  // Defaults to [] so signed-out/no-history/fetch-failure all render
  // identically to "nothing to show" without any extra loading state.
  const [history, setHistory] = useState<DiagnosticHistoryEntry[]>([])

  const [isExportingPdf, setIsExportingPdf] = useState(false)
  const [isGeneratingBlueprint, setIsGeneratingBlueprint] = useState(false)
  const [isAdvisoryModalOpen, setIsAdvisoryModalOpen] = useState(false)
  const [blueprintPercent, setBlueprintPercent] = useState(0)
  const [blueprintElapsedSec, setBlueprintElapsedSec] = useState(0)
  const blueprintTickRef = useRef<NodeJS.Timeout | null>(null)

  const handleGenerateBlueprint = async () => {
    if (state.status !== 'loaded') {
      router.push('/blueprint')
      return
    }
    try {
      setIsGeneratingBlueprint(true)
      setBlueprintPercent(0)
      setBlueprintElapsedSec(0)
      if (blueprintTickRef.current) clearInterval(blueprintTickRef.current)
      blueprintTickRef.current = setInterval(() => setBlueprintElapsedSec((s) => s + 1), 1000)
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
        diagnosticData,
        locale,
        (progress) => setBlueprintPercent(progress.percent)
      )

      router.push('/blueprint')
    } catch (err) {
      console.error('Failed to generate blueprint:', err)
      alert(locale === 'id' ? 'Gagal membuat blueprint. Silakan coba lagi.' : 'Failed to generate blueprint. Please try again.')
    } finally {
      if (blueprintTickRef.current) clearInterval(blueprintTickRef.current)
      blueprintTickRef.current = null
      setIsGeneratingBlueprint(false)
    }
  }

  useEffect(() => {
    try {
      // Standard fetch-on-mount / sync-from-prop / hydrate-after-mount pattern
      // (functionally correct in this pre-Suspense/pre-React-Query codebase) —
      // not restructuring this component's data flow to satisfy the newer
      // React Compiler style rule; see other documented instances of this.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLlmResult(DeepDiagnosticService.loadResult() as unknown as Record<string, any> | null)
    } catch { /* AI analysis is optional — never block the report */ }
  }, [])

  useEffect(() => () => {
    if (blueprintTickRef.current) clearInterval(blueprintTickRef.current)
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
        setState({ status: 'error', message: locale === 'id' ? 'Gagal membaca data diagnostik. Silakan jalankan diagnostik lagi.' : 'Failed to parse diagnostic data. Please run the diagnostic again.' })
        return
      }
      const context = validateContext(parsed)
      if (!context) {
        setState({ status: 'error', message: locale === 'id' ? 'Data diagnostik rusak atau tidak lengkap. Silakan jalankan diagnostik lagi.' : 'Diagnostic data is malformed or incomplete. Please run the diagnostic again.' })
        return
      }
      setState({ status: 'loaded', context: upgradeDiagnosticContext(context, findIndustryHint()) })
    }
    loadContext()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (state.status === 'loading') return <LoadingState locale={locale} />
  if (state.status === 'error') return <ErrorCard message={state.message} locale={locale} />

  const { context } = state
  const { scores, calculations, qualitative } = context
  // Bahasa Indonesia phase 2 — prefer the Indonesian-composed arrays when the
  // stored context has them (contexts created after this feature shipped);
  // fall back to the English fields for older contexts, so the report never
  // renders broken/blank for legacy data (graceful degradation, matching the
  // existing `scoreDrivers?` convention in types/diagnostic.ts).
  const opportunities = (locale === 'id' && context.opportunitiesId) ? context.opportunitiesId : context.opportunities
  const risks = (locale === 'id' && context.risksId) ? context.risksId : context.risks
  const roomForImprovement = (locale === 'id' && context.roomForImprovementId) ? context.roomForImprovementId : context.roomForImprovement
  const scoreDriversLocalized = (locale === 'id' && context.scoreDriversId) ? context.scoreDriversId : context.scoreDrivers

  const handleDownloadPdf = async () => {
    setIsExportingPdf(true)
    try {
      // Pass the same blended scores shown on this page (70% deterministic +
      // 30% AI assessment) so the PDF's composite matches the on-screen one
      // instead of silently reverting to the raw deterministic score.
      // llmResult must be forwarded too — without it the PDF silently drops
      // the entire Business Operations Analysis section the user sees on this page.
      await exportReportToPdf('pdf-print-layout', context.company, { ...context, scores: displayScores }, llmResult, locale)
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
  const roiSensitivity = getROISensitivity(context, locale)

  // Phase 2.3 — Confidence display: inverts calculations.missingInputs (already
  // computed by calculateROI) into a "known vs not provided" reasoning line.
  const confidenceReasons = buildConfidenceReasoning(calculations.missingInputs, locale)

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
  const historyDelta = computeDelta(history, locale)
  const historySeries = compositeSeries(history)
  const compositeVsMedian = industryBenchmark
    ? formatVsMedian(displayScores.composite, industryBenchmark.composite, locale)
    : null

  // Executive Operational Diagnosis — identical strings to the PDF (shared builders in
  // lib/readinessNarrative.ts), fed the same blended displayScores the PDF gets.
  const dimScoreOf = (k: string) => Math.round((scores as unknown as Record<string, number>)[k] ?? 0)
  const verdictNarrative = buildVerdictNarrative({
    company: context.company || 'Your organisation',
    composite: displayScores.composite,
    maturityLevel: displayScores.maturityLevel,
    weakestKey: scores.weakestDimension,
    weakestScore: dimScoreOf(scores.weakestDimension),
    strongestKey: scores.strongestDimension,
    strongestScore: dimScoreOf(scores.strongestDimension),
  }, locale)
  // Plain-language translation of the strongest/weakest dimension pair —
  // sits above the 6-dimension breakdown in Operational Health so a
  // non-finance reader gets "so what" before the raw numbers.
  const operationalHealthPlainLanguage = buildOperationalHealthPlainLanguage({
    strongestKey: scores.strongestDimension,
    strongestScore: dimScoreOf(scores.strongestDimension),
    strongestLabel: DIM_LABELS[locale][scores.strongestDimension] ?? scores.strongestDimension,
    weakestKey: scores.weakestDimension,
    weakestScore: dimScoreOf(scores.weakestDimension),
    weakestLabel: DIM_LABELS[locale][scores.weakestDimension] ?? scores.weakestDimension,
  }, locale)
  const firstMoves = buildFirstMoves({
    firstImprovement: Array.isArray(roomForImprovement) && roomForImprovement.length > 0
      ? roomForImprovement[0] : null,
    topOpportunity: opportunities[0] ?? null,
    hasBudgetInput: (calculations.assumedBudgetMidpointLocal ?? (calculations as any).assumedBudgetMidpointUSD) != null,
    leadershipClause: buildLeadershipClause(qualitative.leadershipAlignment || '', locale),
  }, locale)

  // Executive Summary (section 1) + Executive Insights (per-section closers)
  // + AI Enablement (section 10) — identical builders/strings to the PDF.
  const topOpportunityTitle = opportunities[0]?.title ?? null
  const businessValueLabel = totalAnnualSavingsLocal != null ? fmtLocal(totalAnnualSavingsLocal) : null
  const executiveSummary = buildExecutiveSummary({
    company: context.company || 'Your organisation',
    composite: displayScores.composite,
    maturityLevel: displayScores.maturityLevel,
    weakestKey: scores.weakestDimension,
    weakestScore: dimScoreOf(scores.weakestDimension),
    strongestKey: scores.strongestDimension,
    strongestScore: dimScoreOf(scores.strongestDimension),
    businessValueLabel,
    topOpportunityTitle,
  }, locale)
  // ID: flowing prose (an arrow chain of noun phrases reads as machine-
  // translated in Indonesian). EN: keep the existing chip-chain UI, which
  // reads fine as an English business-writing convention.
  const weakestConsequenceNarrative = buildConsequenceNarrative(scores.weakestDimension, locale)
  const weakestConsequenceChain = weakestConsequenceNarrative ? null : (DIM_CONSEQUENCE_CHAINS[locale][scores.weakestDimension] ?? null)
  const diagnosisInsight = buildExecutiveInsight('diagnosis', { weakestKey: scores.weakestDimension }, locale)
  const topOpportunity = opportunities[0] ?? null
  const opportunitiesInsight = buildExecutiveInsight('opportunities', {
    topOpportunityTitle: topOpportunity?.title ?? null,
    topOpportunityTimeToValueWeeks: topOpportunity?.timeToValueWeeks ?? null,
    topOpportunityDataReadiness: topOpportunity?.dataReadiness ?? null,
  }, locale)
  const financialInsight = buildExecutiveInsight('financial', {
    hasBudgetInput: (calculations.assumedBudgetMidpointLocal ?? (calculations as any).assumedBudgetMidpointUSD) != null,
    paybackMonths: calculations.paybackMonths,
    threeYearROIPercent: calculations.threeYearROIPercent,
  }, locale)
  const topImprovement = Array.isArray(roomForImprovement) && roomForImprovement.length > 0
    ? roomForImprovement[0] : null
  const improvementsInsight = buildExecutiveInsight('improvements', {
    topImprovementTitle: topImprovement?.title ?? null,
    topImprovementAction: topImprovement?.recommendedAction ?? null,
  }, locale)
  const aiEnablement = buildAiEnablement({
    topOpportunityTitle,
    weakestLabel: DIM_LABELS[locale][scores.weakestDimension] ?? scores.weakestDimension,
  }, locale)

  // Phase E2.6 — section-level "so what" captions. Dimension bars' caption
  // lives inside DimensionBenchmarkBars itself (shared with the PDF via the
  // same builder); these four are page-only or need page-local data.
  const radarCaption = buildDimensionSpreadCaption(scores as unknown as Record<string, number>, locale)
  const opportunityMatrixCaption = buildOpportunityMatrixCaption(opportunities, locale)
  const roiTilesCaption = buildRoiTilesCaption(annualLaborSavingsLocal, annualProcessSavingsLocal, locale)
  const riskRegisterCaption = buildRiskRegisterCaption(risks, locale)

  const assessmentBullets: { icon: string; color: string; text: string }[] = locale === 'id' ? [
    { icon: '▲', color: '#afd199', text: `Perusahaan/organisasi Anda memperoleh skor ${displayScores.composite}/100, berada pada kematangan ${maturityLevelLabel(displayScores.maturityLevel, locale)}.${_llmScore != null ? ' (komposit gabungan 70% deterministik + 30% asesmen AI)' : ''}` },
    { icon: '▲', color: '#afd199', text: `Dimensi terkuat: ${humanizeDimensionKey(scores.strongestDimension, locale)}.` },
    { icon: '▽', color: '#fbbf24', text: `Kesenjangan terbesar: ${humanizeDimensionKey(scores.weakestDimension, locale)}.` },
    { icon: '▽', color: '#fbbf24', text: `${highRiskCount} risiko tingkat tinggi teridentifikasi.` },
    { icon: '▶', color: '#afd199', text: `${quickWinCount} peluang quick win tersedia.` },
  ] : [
    { icon: '▲', color: '#afd199', text: `Your company / organisation scores ${displayScores.composite}/100, placing it at ${maturityLevelLabel(displayScores.maturityLevel, locale)} maturity.${_llmScore != null ? ' (composite blended 70% deterministic + 30% AI assessment)' : ''}` },
    { icon: '▲', color: '#afd199', text: `Strongest dimension: ${humanizeDimensionKey(scores.strongestDimension, locale)}.` },
    { icon: '▽', color: '#fbbf24', text: `Greatest gap: ${humanizeDimensionKey(scores.weakestDimension, locale)}.` },
    { icon: '▽', color: '#fbbf24', text: `${highRiskCount} high-severity risk${highRiskCount !== 1 ? 's' : ''} identified.` },
    { icon: '▶', color: '#afd199', text: `${quickWinCount} quick-win opportunit${quickWinCount !== 1 ? 'ies' : 'y'} available.` },
  ]

  const sortedRisks = [...risks].sort((a, b) => {
    const order = { HIGH: 0, MEDIUM: 1, LOW: 2 }
    return order[a.severity] - order[b.severity]
  })

  // C5 — Operational Constraints is a standalone section ONLY with ≥2 risks.
  // A single risk is folded into the Executive Operational Diagnosis as one
  // "Key constraint: …" line (shared builder → identical to the PDF); 0 risks
  // render nothing. Keeps a lone risk from reading as an empty, templated
  // section.
  const hasStandaloneConstraints = risks.length >= 2
  const foldedConstraint = buildFoldedConstraintNote(risks, locale)

  // `questionId` lets qualVal translate a canonical stored answer (a radio/
  // multiselect option string from the intake flow) to its Bahasa Indonesia
  // display label via the same dictionary the intake flow itself uses.
  // Omit it for free-text answers (primaryObjective, topPainPoints,
  // kpiBaseline) — there is no canonical value to look up for those.
  function qualVal(v: string | string[] | undefined, questionId?: string): string {
    const fallback = locale === 'id' ? 'Belum diberikan' : 'Not provided'
    const translate = (s: string) => (locale === 'id' && questionId) ? humanizeAnswerId(questionId, s) : s
    if (!v) return fallback
    if (Array.isArray(v)) return v.length > 0 ? v.map(translate).join(', ') : fallback
    return v.trim() ? translate(v.trim()) : fallback
  }

  // Phase E2.5 — sticky section nav rail. Mirrors the section order below;
  // the "Improvement Priorities" entry is only included when that card
  // actually renders, so the rail never points at a missing anchor.
  const hasImprovementPriorities =
    Array.isArray(roomForImprovement) && roomForImprovement.length > 0
  const navSections = locale === 'id' ? [
    { id: 'section-executive-summary', label: 'Ringkasan Eksekutif' },
    { id: 'section-operational-health', label: 'Kesehatan Operasional' },
    { id: 'section-executive-diagnosis', label: 'Diagnosis' },
    { id: 'section-operations-analysis', label: 'Analisis Operasional' },
    ...(hasStandaloneConstraints ? [{ id: 'section-operational-constraints', label: 'Kendala' }] : []),
    { id: 'section-transformation-opportunities', label: 'Peluang' },
    { id: 'section-financial-case', label: 'Analisis Keuangan' },
    ...(hasImprovementPriorities ? [{ id: 'section-improvement-priorities', label: 'Prioritas' }] : []),
    { id: 'section-business-context', label: 'Konteks Bisnis' },
    { id: 'section-ai-enablement', label: 'Pemanfaatan AI' },
  ] : [
    { id: 'section-executive-summary', label: 'Executive Summary' },
    { id: 'section-operational-health', label: 'Operational Health' },
    { id: 'section-executive-diagnosis', label: 'Diagnosis' },
    { id: 'section-operations-analysis', label: 'Operations Analysis' },
    // C5 — only list Constraints when it actually renders as its own section
    // (≥2 risks); otherwise the rail would point at a merged-away anchor.
    ...(hasStandaloneConstraints ? [{ id: 'section-operational-constraints', label: 'Constraints' }] : []),
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
        <div className={styles.languageSwitcherRow}>
          <label htmlFor="result-lang" className={styles.languageSwitcherLabel}>
            {locale === 'id' ? 'Bahasa' : 'Language'}
          </label>
          <select
            id="result-lang"
            className={styles.languageSwitcher}
            value={locale}
            onChange={(e) => setLocale(e.target.value as 'en' | 'id')}
          >
            <option value="en">English</option>
            <option value="id">Bahasa Indonesia</option>
          </select>
        </div>

        <HeaderBar
          company={context.company}
          submittedAt={context.submittedAt}
          onDownloadPdf={handleDownloadPdf}
          isExportingPdf={isExportingPdf}
          delta={historyDelta}
          locale={locale}
        />

        {/* ── Executive Summary ── */}
        <div id="section-executive-summary" className={`${styles.card} ${styles.executiveSummaryCard}`}>
          <h2 className={styles.sectionLabel}>{locale === 'id' ? 'Ringkasan Eksekutif' : 'Executive Summary'}</h2>
          <p className={styles.executiveSummaryText}>{executiveSummary}</p>

          {/* Glossary — defines the handful of English/finance terms this
              report keeps in their original form, once, up front, so they
              read without re-explaining every time they appear later. */}
          <div className={styles.glossaryBox}>
            <p className={styles.glossaryTitle}>{locale === 'id' ? 'Istilah dalam laporan ini' : 'Terms used in this report'}</p>
            <dl className={styles.glossaryList}>
              {GLOSSARY_TERMS[locale].map((g) => (
                <div key={g.term} className={styles.glossaryItem}>
                  <dt className={styles.glossaryTerm}>{g.term}</dt>
                  <dd className={styles.glossaryDefinition}>{g.definition}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        {/* ── Operational Health ── */}
        <div id="section-operational-health" className={styles.card}>
          <h2 className={styles.sectionLabel}>{locale === 'id' ? 'Kesehatan Operasional' : 'Operational Health'}</h2>
          <p className={styles.plainLanguageLead}>{operationalHealthPlainLanguage}</p>

          {/* Top row: ScoreRing | RadarChart */}
          <div className={styles.scorecardTopRow}>
            <div className={styles.scorecardRingCol}>
              <ScoreRing score={displayScores.composite} maturityLevel={maturityLevelLabel(displayScores.maturityLevel, locale)} locale={locale} />
              {compositeVsMedian && (
                <p className={styles.compositeBenchmarkCaption}>
                  {compositeVsMedian}
                  <br />
                  <span className={styles.compositeBenchmarkDisclaimer}>
                    {locale === 'id' ? 'Benchmark yang bersifat arah, bukan statistik terukur.' : 'Directional benchmark, not a measured statistic.'}
                  </span>
                </p>
              )}
              <HistorySparkline series={historySeries} locale={locale} />
            </div>
            <div className={styles.scorecardChartCol}>
              <div>
                <RadarChart scores={scores} benchmark={industryBenchmark} locale={locale} />
                <p className={styles.vizCaption}>{radarCaption}</p>
              </div>
            </div>
          </div>

          {/* Bottom row: Strongest/Weakest | Assessment bullets */}
          <div className={styles.scorecardBottomRow}>
            {/* Left: Strongest + Weakest with colored underline bars */}
            <div className={styles.summaryRow}>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>{locale === 'id' ? 'Terkuat' : 'Strongest'}</span>
                <span className={styles.summaryValue}>{humanizeDimensionKey(scores.strongestDimension, locale)}</span>
                <span className={styles.summaryBar} style={{ background: '#afd199' }} />
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>{locale === 'id' ? 'Terlemah' : 'Weakest'}</span>
                <span className={styles.summaryValue}>{humanizeDimensionKey(scores.weakestDimension, locale)}</span>
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

          <DimensionBenchmarkBars scores={scores} benchmark={industryBenchmark} locale={locale} />
          <DimensionDrivers scoreDrivers={scoreDriversLocalized} locale={locale} />
        </div>

        {/* ── Executive Operational Diagnosis — same narrative the PDF renders ── */}
        <div id="section-executive-diagnosis" className={styles.card}>
          <h2 className={styles.sectionLabel}>{locale === 'id' ? 'Diagnosis Operasional Eksekutif' : 'Executive Operational Diagnosis'}</h2>
          <p className={styles.verdictNarrative}>{verdictNarrative}</p>
          {weakestConsequenceNarrative && (
            <p className={styles.consequenceNarrative}>{weakestConsequenceNarrative}</p>
          )}
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
          {/* C5 — single folded constraint (only when exactly 1 risk). */}
          {foldedConstraint && (
            <p className={styles.foldedConstraint}>{foldedConstraint}</p>
          )}
          <div className={styles.executiveInsight}>
            <span className={styles.executiveInsightLabel}>{locale === 'id' ? 'Wawasan Eksekutif' : 'Executive Insight'}</span>
            {diagnosisInsight}
          </div>
        </div>

        {/* ── Business Operations Analysis (model-generated; numbers stay deterministic) ── */}
        <div id="section-operations-analysis" className={styles.card}>
          <h2 className={styles.sectionLabel}>{locale === 'id' ? 'Analisis Operasional Bisnis' : 'Business Operations Analysis'}</h2>
          {locale === 'id' && llmResult && (
            <p className={styles.aiLanguageNote}>
              Analisis naratif di bawah ini saat ini masih dalam Bahasa Inggris — dukungan Bahasa Indonesia untuk bagian ini sedang dalam pengembangan.
            </p>
          )}
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
                    <h3 className={styles.aiColLabel}>{locale === 'id' ? 'Kekuatan' : 'Strengths'}</h3>
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
                      <h3 className={styles.aiColLabel}>{locale === 'id' ? 'Kendala utama' : 'Primary constraints'}</h3>
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
                      <h3 className={styles.aiColLabel}>{locale === 'id' ? 'Peluang transformasi' : 'Transformation opportunities'}</h3>
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
                  <strong>{locale === 'id' ? 'Langkah berikutnya yang disarankan:' : 'Recommended next step:'}</strong> {llmResult.recommended_next_step}
                </p>
              )}
            </>
          ) : (
            <p className={styles.aiUnavailable}>
              {locale === 'id'
                ? 'Analisis operasional bisnis tidak tersedia untuk pengajuan ini. Skor dan proyeksi dalam laporan ini dihitung langsung dari jawaban Anda.'
                : 'Business operations analysis was unavailable for this submission. The scores and projections in this report are calculated directly from your answers.'}
            </p>
          )}
        </div>

        {/* ── Operational Constraints (was Risk Register) — C5: standalone
              only with ≥2 risks; a single risk is folded into the diagnosis
              above, 0 risks render nothing. ── */}
        {hasStandaloneConstraints && (
          <div id="section-operational-constraints" className={styles.card}>
            <h2 className={styles.sectionLabel}>{locale === 'id' ? 'Kendala Operasional' : 'Operational Constraints'}</h2>
            {riskRegisterCaption && <p className={styles.vizCaption}>{riskRegisterCaption}</p>}
            <div className={styles.riskList}>
              {sortedRisks.map(risk => (
                <RiskCard key={risk.id} risk={risk} locale={locale} />
              ))}
            </div>
          </div>
        )}

        {/* ── Transformation Opportunities ── */}
        <div id="section-transformation-opportunities" className={styles.card}>
          <h2 className={styles.sectionLabel}>{locale === 'id' ? 'Peluang Transformasi' : 'Transformation Opportunities'}</h2>
          {opportunities.length === 0 ? (
            <p className={styles.emptyMessage}>{locale === 'id' ? 'Belum ada peluang yang teridentifikasi.' : 'No opportunities identified.'}</p>
          ) : (
            <div className={styles.matrixLayout}>
              <div>
                <OpportunityMatrix
                  opportunities={opportunities}
                  highlightedId={highlightedId}
                  onDotClick={(id) => setHighlightedId(prev => prev === id ? null : id)}
                  locale={locale}
                />
                {opportunityMatrixCaption && <p className={styles.vizCaption}>{opportunityMatrixCaption}</p>}
              </div>
              <div className={styles.opportunityList}>
                {opportunities.map((opp, idx) => (
                  <OpportunityCard
                    key={opp.id}
                    opportunity={opp}
                    isHighlighted={opp.id === highlightedId}
                    colorIndex={idx}
                    currencyCode={currencyCode}
                    locale={locale}
                  />
                ))}
              </div>
            </div>
          )}
          <div className={styles.executiveInsight}>
            <span className={styles.executiveInsightLabel}>{locale === 'id' ? 'Wawasan Eksekutif' : 'Executive Insight'}</span>
            {opportunitiesInsight}
          </div>
        </div>

        {/* ── Financial Case ── */}
        <div id="section-financial-case" className={styles.card}>
          <h2 className={styles.sectionLabel}>{locale === 'id' ? 'Analisis Keuangan' : 'Financial Case'}</h2>

          {!calculations.hasEnoughDataForProjection && (
            <div className={styles.confidenceBanner}>
              <p className={styles.confidenceHeadline}>
                {locale === 'id'
                  ? `Proyeksi dengan keyakinan ${calculations.confidenceLevel === 'low' ? 'rendah' : calculations.confidenceLevel === 'medium' ? 'sedang' : 'tinggi'}`
                  : `${calculations.confidenceLevel} confidence projection`}
              </p>
              <p className={styles.confidenceBody}>
                {locale === 'id'
                  ? 'Proyeksi ini didasarkan pada data input yang terbatas dan mungkin tidak mencerminkan hasil sebenarnya.'
                  : 'These projections are based on limited input data and may not reflect actual outcomes.'}
              </p>
              {/* Phase 2.3 — Confidence display: a "known vs not provided"
                  reasoning line built from calculations.missingInputs. A
                  separate raw "Missing inputs: manual hours/week, budget,
                  FTE count" line used to render right above this — always in
                  English regardless of locale (the field keys were never
                  translated) and redundant with what this line already says
                  in the "Belum diberikan: ..." clause. Removed rather than
                  translated: two disclosures of the same fact read as
                  noise, not extra information. */}
              {confidenceReasons.length > 0 && (
                <p className={styles.missingInputs}>
                  {confidenceReasons.join(' · ')}
                </p>
              )}
            </div>
          )}

          <div className={styles.roiGrid}>
            <ROIMetricTile label={locale === 'id' ? 'Value Bisnis yang Dihasilkan' : 'Business Value Created'} value={totalAnnualSavingsLocal} formatter={fmtLocal} variant="hero" confidenceLevel={calculations.confidenceLevel} locale={locale} />
            <ROIMetricTile label={locale === 'id' ? 'Value Tenaga Kerja yang Dipulihkan' : 'Recovered Labor Value'} value={annualLaborSavingsLocal} formatter={fmtLocal} confidenceLevel={calculations.confidenceLevel} locale={locale} />
            <ROIMetricTile label={locale === 'id' ? 'Value Efisiensi Proses' : 'Process Efficiency Value'} value={annualProcessSavingsLocal} formatter={fmtLocal} confidenceLevel={calculations.confidenceLevel} locale={locale} />
            <ROIMetricTile
              label={locale === 'id' ? 'Kapasitas Tim yang Dipulihkan' : 'Recovered Team Capacity'}
              value={calculations.hoursReclaimedPerYear}
              formatter={(v) => locale === 'id' ? `${Math.round(v).toLocaleString('id-ID')} jam` : `${Math.round(v).toLocaleString('en-US')} hours`}
              confidenceLevel={calculations.confidenceLevel}
              locale={locale}
            />
            <ROIMetricTile label={locale === 'id' ? 'Periode Payback' : 'Payback Period'} value={calculations.paybackMonths} formatter={(v) => formatMonths(v, locale)} confidenceLevel={calculations.confidenceLevel} locale={locale} />
            <ROIMetricTile
              label={locale === 'id' ? 'ROI 3 Tahun' : '3-Year ROI'}
              value={calculations.threeYearROIPercent}
              formatter={(v) => v >= 999 ? '>999%' : formatPercent(v, locale)}
              confidenceLevel={calculations.confidenceLevel}
              locale={locale}
            />
            <ROIMetricTile label={locale === 'id' ? 'NPV 3 Tahun' : '3-Year NPV'} value={(calculations as any).npv3YearLocal ?? null} formatter={fmtLocal} subtitle={locale === 'id' ? 'Value kini bersih @ diskonto 10%' : 'Net present value @ 10% discount'} confidenceLevel={calculations.confidenceLevel} locale={locale} />
            <ROIMetricTile label={locale === 'id' ? 'Biaya Berjalan Tahunan' : 'Annual Ongoing Cost'} value={(calculations as any).annualOngoingCostLocal ?? null} formatter={fmtLocal} subtitle={locale === 'id' ? 'Estimasi lisensi, pemeliharaan & dukungan' : 'Est. licenses, maintenance & support'} confidenceLevel={calculations.confidenceLevel} locale={locale} />
            <ROIMetricTile label={locale === 'id' ? 'Penghematan Bersih Tahunan' : 'Net Annual Savings'} value={(calculations as any).netAnnualSavingsLocal ?? null} formatter={fmtLocal} subtitle={locale === 'id' ? 'Setelah biaya berjalan' : 'After ongoing cost'} confidenceLevel={calculations.confidenceLevel} locale={locale} />
            <ROIMetricTile label={locale === 'id' ? 'Periode Payback Bersih' : 'Net Payback Period'} value={(calculations as any).netPaybackMonths ?? null} formatter={(v) => formatMonths(v, locale)} subtitle={locale === 'id' ? 'Berdasarkan penghematan bersih' : 'On net savings'} confidenceLevel={calculations.confidenceLevel} locale={locale} />
            <ROIMetricTile
              label={locale === 'id' ? 'Biaya Keterlambatan Operasional (90 hari)' : 'Operational Cost of Delay (90 days)'}
              value={costOfInaction90DaysLocal}
              formatter={fmtLocal}
              subtitle={
                locale === 'id'
                  ? (qualitative.annualRevenue?.toLowerCase().includes('pre-revenue')
                    ? 'Estimasi biaya peluang jika ditunda'
                    : 'Pendapatan yang berisiko jika ditunda')
                  : (qualitative.annualRevenue?.toLowerCase().includes('pre-revenue')
                    ? 'Estimated opportunity cost if delayed'
                    : 'Revenue at risk if delayed')
              }
              confidenceLevel={calculations.confidenceLevel}
              locale={locale}
            />
          </div>
          {roiTilesCaption && <p className={styles.vizCaption}>{roiTilesCaption}</p>}

          {/* Bridges "ROI 3 Tahun" above (gross) and "Kisaran ROI 3 Tahun"
              below (net, after ongoing cost) — the two most-flagged-as-
              confusing numbers on this page, since they read as
              contradictory without this note (NPV negative + ROI positive;
              two different ROI figures on the same screen). */}
          {calculations.hasEnoughDataForProjection && (
            <p className={styles.financialTermsNote}>{buildFinancialTermsNote(locale)}</p>
          )}

          {(calculations as any).scenarioThreeYearROI && (
            <div className={styles.scenarioRow}>
              <span className={styles.scenarioLabel}>{locale === 'id' ? 'Kisaran ROI 3 Tahun' : '3-Year ROI range'}</span>
              <div className={styles.scenarioGrid}>
                <div className={`${styles.scenarioCell} ${styles.scenarioCellLow}`}>
                  <span className={styles.scenarioCellLabel}>{locale === 'id' ? 'Konservatif' : 'Conservative'}</span>
                  <span className={styles.scenarioCellValue}>{fmtRoi((calculations as any).scenarioThreeYearROI.low)}</span>
                </div>
                <div className={`${styles.scenarioCell} ${styles.scenarioCellBase}`}>
                  <span className={styles.scenarioCellLabel}>{locale === 'id' ? 'Dasar' : 'Base'}</span>
                  <span className={styles.scenarioCellValue}>{fmtRoi((calculations as any).scenarioThreeYearROI.base)}</span>
                </div>
                <div className={`${styles.scenarioCell} ${styles.scenarioCellHigh}`}>
                  <span className={styles.scenarioCellLabel}>{locale === 'id' ? 'Optimistis' : 'Optimistic'}</span>
                  <span className={styles.scenarioCellValue}>{fmtRoi((calculations as any).scenarioThreeYearROI.high)}</span>
                </div>
              </div>
              <span className={styles.scenarioNote}>
                {locale === 'id'
                  ? `Kisaran mencerminkan efisiensi otomasi 50%–90%; skenario dasar menggunakan ${Math.round((calculations.efficiencyFactor ?? 0.75) * 100)}%.`
                  : `Range reflects 50%–90% automation efficiency; base case uses ${Math.round((calculations.efficiencyFactor ?? 0.75) * 100)}%.`}
              </span>
            </div>
          )}

          {calculations.hasEnoughDataForProjection && (
            <ROISensitivityTornado
              sensitivity={roiSensitivity}
              baseValueLocal={totalAnnualSavingsLocal}
              baseBoundLabel={`${Math.round((calculations.efficiencyFactor ?? 0.75) * 100)}%`}
              formatter={fmtLocal}
              locale={locale}
            />
          )}

          {calculations.hasEnoughDataForProjection && (
            <EfficiencyWhatIfSlider
              context={context}
              calculations={calculations}
              fmtLocal={fmtLocal}
              formatMonths={(v: number | null | undefined) => formatMonths(v, locale)}
              formatPercent={(v: number | null | undefined) => formatPercent(v, locale)}
              locale={locale}
            />
          )}

          {calculations.hasEnoughDataForProjection && (
            <div className={styles.assumptionsNote}>
              <p className={styles.assumptionsTitle}>{locale === 'id' ? 'Bagaimana angka-angka ini dihitung' : 'How these figures were calculated'}</p>
              <p className={styles.assumptionsIntro}>{buildMethodologyIntro(locale)}</p>
              <ul className={styles.assumptionsList}>
                <li className={styles.stepRow}>
                  <span className={styles.stepLabel}>{locale === 'id' ? 'Langkah 1 — Kapasitas tim yang dipulihkan/tahun' : 'Step 1 — Recovered team capacity/year'}</span>
                  <span className={styles.stepValue}>
                    {locale === 'id' ? (
                      <>
                        {calculations.hoursReclaimedPerYear} jam
                        {' = '}jam manual/minggu × 52 minggu × kesenjangan otomasi × {Math.round((calculations.efficiencyFactor ?? 0.75) * 100)}% faktor efisiensi
                      </>
                    ) : (
                      <>
                        {calculations.hoursReclaimedPerYear} hrs
                        {' = '}manual hours/week × 52 weeks × automation gap × {Math.round((calculations.efficiencyFactor ?? 0.75) * 100)}% efficiency factor
                      </>
                    )}
                  </span>
                </li>
                <li className={styles.stepRow}>
                  <span className={styles.stepLabel}>{locale === 'id' ? 'Langkah 2 — Value tenaga kerja yang dipulihkan' : 'Step 2 — Recovered labor value'}</span>
                  <span className={styles.stepValue}>
                    {locale === 'id' ? (
                      <>
                        {fmtLocal(calculations.annualLaborSavingsLocal)} = {calculations.hoursReclaimedPerYear} jam × <strong>{fmtLocal(calculations.assumedHourlyRateLocal)}/jam</strong>
                        {calculations.smallTeamRateApplied
                          ? ` (tarif biaya peluang untuk tim 1–5 FTE — 50% dari benchmark ${calculations.rateBenchmarkLabelId ?? 'industri'})`
                          : ` (benchmark ${calculations.rateBenchmarkLabelId ?? 'industri'})`}
                      </>
                    ) : (
                      <>
                        {fmtLocal(calculations.annualLaborSavingsLocal)} = {calculations.hoursReclaimedPerYear} hrs × <strong>{fmtLocal(calculations.assumedHourlyRateLocal)}/hr</strong>
                        {calculations.smallTeamRateApplied
                          ? ` (opportunity-cost rate for teams of 1–5 FTEs — 50% of ${calculations.rateBenchmarkLabel ?? 'industry'} benchmark)`
                          : ` (${calculations.rateBenchmarkLabel ?? 'industry'} benchmark)`}
                      </>
                    )}
                  </span>
                </li>
                <li className={styles.stepRow}>
                  <span className={styles.stepLabel}>{locale === 'id' ? 'Langkah 3 — Value efisiensi proses' : 'Step 3 — Process efficiency value'}</span>
                  <span className={styles.stepValue}>
                    {locale === 'id'
                      ? `${fmtLocal(calculations.annualProcessSavingsLocal)} = 20% dari penghematan tenaga kerja (pengurangan overhead operasional — estimasi benchmark internal)`
                      : `${fmtLocal(calculations.annualProcessSavingsLocal)} = 20% of labor savings (operational overhead reduction — internal benchmark estimate)`}
                  </span>
                </li>
                <li className={styles.stepRow}>
                  <span className={styles.stepLabel}>{locale === 'id' ? 'Biaya operasional berjalan' : 'Ongoing run cost'}</span>
                  <span className={styles.stepValue}>
                    {locale === 'id'
                      ? `${fmtLocal((calculations as any).annualOngoingCostLocal)} / tahun = ${Math.round(((calculations as any).ongoingCostRate ?? 0.2) * 100)}% dari investasi awal (lisensi, pemeliharaan, dukungan). Angka bersih dan payback dihitung setelah biaya ini.`
                      : `${fmtLocal((calculations as any).annualOngoingCostLocal)} / year = ${Math.round(((calculations as any).ongoingCostRate ?? 0.2) * 100)}% of the initial investment (licenses, maintenance, support). Net figures and payback are computed after this cost.`}
                  </span>
                </li>
                <li className={styles.stepRow}>
                  <span className={styles.stepLabel}>{locale === 'id' ? 'Mata uang & sumber' : 'Currency & sources'}</span>
                  <span className={styles.stepValue}>
                    {locale === 'id'
                      ? `Kurs valuta asing per ${(calculations as any).fxAsOfId ?? (calculations as any).fxAsOf ?? getFxAsOfLabel('id')} (diperbarui otomatis setiap 2 jam dari data pasar langsung); faktor efisiensi 75% dan angka overhead proses 20% adalah estimasi benchmark internal, bukan jaminan khusus klien.`
                      : `FX rates as of ${(calculations as any).fxAsOf ?? getFxAsOfLabel()} (auto-refreshed every 2 hours from live market data); the 75% efficiency factor and 20% process-overhead figure are internal benchmark estimates, not client-specific guarantees.`}
                  </span>
                </li>
                <li className={styles.stepRow}>
                  <span className={styles.stepLabel}>{locale === 'id' ? 'Langkah 4 — Value bisnis yang dihasilkan' : 'Step 4 — Business value created'}</span>
                  <span className={styles.stepValue}>
                    <strong>{fmtLocal(calculations.totalAnnualSavingsLocal)}</strong> {locale === 'id' ? '= tenaga kerja + penghematan proses' : '= labor + process savings'}
                  </span>
                </li>
                {calculations.assumedBudgetMidpointLocal != null && (
                  <li className={styles.stepRow}>
                    <span className={styles.stepLabel}>{locale === 'id' ? 'Langkah 5 — Periode payback' : 'Step 5 — Payback period'}</span>
                    <span className={styles.stepValue}>
                      {calculations.paybackMonths != null ? (locale === 'id' ? `${Math.round(calculations.paybackMonths)} bulan` : `${Math.round(calculations.paybackMonths)} months`) : '—'}{' '}
                      = <strong>{fmtLocal(calculations.assumedBudgetMidpointLocal)}</strong> {locale === 'id' ? 'investasi ÷' : 'investment ÷'} {fmtLocal(calculations.totalAnnualSavingsLocal)}/{locale === 'id' ? 'thn' : 'yr'} × 12
                      {' '}{locale === 'id' ? '(titik tengah kisaran anggaran yang Anda pilih)' : '(midpoint of your selected budget range)'}
                    </span>
                  </li>
                )}
                {calculations.assumedBudgetMidpointLocal != null && (
                  <li className={styles.stepRow}>
                    <span className={styles.stepLabel}>{locale === 'id' ? 'Langkah 6 — ROI 3 Tahun' : 'Step 6 — 3-Year ROI'}</span>
                    <span className={styles.stepValue}>
                    <strong style={{ color: calculations.threeYearROIPercent != null && calculations.threeYearROIPercent < 0 ? '#f87171' : '#4ade80' }}>
                      {calculations.threeYearROIPercent != null ? `${formatPercent(calculations.threeYearROIPercent, locale)}` : '—'}
                    </strong>
                    {' = '}({fmtLocal(calculations.totalAnnualSavingsLocal)}/{locale === 'id' ? 'thn' : 'yr'} × 3 − {fmtLocal(calculations.assumedBudgetMidpointLocal)}) ÷ {fmtLocal(calculations.assumedBudgetMidpointLocal)} × 100
                    </span>

                    {calculations.threeYearROIPercent != null && calculations.threeYearROIPercent < 0 && calculations.totalAnnualSavingsLocal != null && calculations.assumedBudgetMidpointLocal != null && (() => {
                      const savings3yr = calculations.totalAnnualSavingsLocal! * 3
                      const budget = calculations.assumedBudgetMidpointLocal!
                      const shortfall = budget - savings3yr
                      const breakEvenYears = budget / calculations.totalAnnualSavingsLocal!
                      const savingsNeededPerYear = budget / 3
                      return locale === 'id' ? (
                        <ul className={styles.roiNegativeList}>
                          <li className={styles.roiNegativeReason}>
                            <span className={styles.roiNegativeLabel}>⚠ Mengapa negatif?</span>
                            Penghematan kumulatif 3 tahun Anda (<strong>{fmtLocal(savings3yr)}</strong>) kurang{' '}
                            <strong style={{ color: '#f87171' }}>{fmtLocal(shortfall)}</strong>{' '}
                            dari total investasi ({fmtLocal(budget)}). Titik impas berada pada{' '}
                            <strong>~{breakEvenYears.toFixed(1).replace('.', ',')} tahun</strong>, bukan 3 tahun.
                          </li>
                          <li className={styles.roiFixItem}>
                            <span className={styles.roiFixLabel}>Solusi A — Kurangi ruang lingkup anggaran awal</span>
                            Mulai dengan anggaran <strong>{fmtLocal(savings3yr)}</strong> atau lebih kecil.
                            Jumlah tersebut sepenuhnya kembali pada tahun ke-3 dengan tingkat penghematan Anda saat ini.
                          </li>
                          <li className={styles.roiFixItem}>
                            <span className={styles.roiFixLabel}>Solusi B — Tingkatkan kedalaman otomasi</span>
                            Otomasikan lebih banyak jam kerja atau tutup kesenjangan otomasi yang lebih besar untuk mendorong penghematan tahunan menjadi setidaknya{' '}
                            <strong>{fmtLocal(savingsNeededPerYear)}/tahun</strong> (saat ini {fmtLocal(calculations.totalAnnualSavingsLocal)}/tahun).
                          </li>
                        </ul>
                      ) : (
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
                      <span style={{ color: '#86efac', gridColumn: '2' }}>{locale === 'id' ? '✓ Sepenuhnya kembali dalam 3 tahun.' : '✓ Fully recovered within 3 years.'}</span>
                    }
                  </li>
                )}
              </ul>
            </div>
          )}
          <div className={styles.executiveInsight}>
            <span className={styles.executiveInsightLabel}>{locale === 'id' ? 'Wawasan Eksekutif' : 'Executive Insight'}</span>
            {financialInsight}
          </div>
        </div>

        {/* ── Operational Improvement Priorities ── */}
        {Array.isArray(roomForImprovement) && roomForImprovement.length > 0 && (
          <div id="section-improvement-priorities" className={styles.card}>
            <h2 className={styles.sectionLabel}>{locale === 'id' ? 'Prioritas Peningkatan Operasional' : 'Operational Improvement Priorities'}</h2>
            <p className={styles.improvementIntro}>
              {locale === 'id'
                ? 'Area yang diprioritaskan untuk diperkuat sebelum dan selama adopsi AI. Ini langsung menjadi masukan untuk Transformation Blueprint Anda.'
                : 'Prioritised areas to strengthen before and during AI adoption. These feed directly into your Transformation Blueprint.'}
            </p>
            <div className={styles.improvementList}>
              {roomForImprovement.map((item) => (
                <div key={item.id} className={styles.improvementItem}>
                  <div className={styles.improvementHeader}>
                    <span className={styles.improvementTitle}>{item.title}</span>
                    <span className={`${styles.improvementBadge} ${styles[`priority_${item.priority}`]}`}>
                      {locale === 'id'
                        ? `Prioritas ${item.priority === 'high' ? 'tinggi' : item.priority === 'medium' ? 'sedang' : 'rendah'}`
                        : `${item.priority} priority`}
                    </span>
                    <span className={styles.improvementArea}>
                      {locale === 'id'
                        ? ({ Process: 'Proses', Data: 'Data', Strategy: 'Strategi', People: 'SDM', Governance: 'Tata Kelola', 'Automation Coverage': 'Cakupan Otomasi' } as Record<string, string>)[item.area] ?? item.area
                        : item.area}
                    </span>
                  </div>
                  <div className={styles.improvementBody}>
                    <p className={styles.improvementField}>
                      <span className={styles.improvementFieldLabel}>{locale === 'id' ? 'Kondisi saat ini' : 'Current state'}</span>
                      {item.currentState}
                    </p>
                    <p className={styles.improvementField}>
                      <span className={styles.improvementFieldLabel}>{locale === 'id' ? 'Yang perlu diperbaiki' : 'What to improve'}</span>
                      {item.recommendedAction}
                    </p>
                    <p className={styles.improvementField}>
                      <span className={styles.improvementFieldLabel}>{locale === 'id' ? 'Dampak operasional' : 'Operational impact'}</span>
                      {item.operationalImpact}
                    </p>
                    {(() => {
                      // Phase 2.2 — "Evidence Used": the answers computeScoreDrivers
                      // already resolved for this item's dimension (or the raw
                      // automation/hours answers for the automation-gap item).
                      const evidence = buildEvidenceUsed(item, scoreDriversLocalized, context.quantitative, locale)
                      return evidence ? (
                        <p className={styles.improvementField}>
                          <span className={styles.improvementFieldLabel}>{locale === 'id' ? 'Bukti yang digunakan' : 'Evidence used'}</span>
                          {evidence.join(' → ')}
                        </p>
                      ) : null
                    })()}
                  </div>
                  <div className={styles.beforeAfter}>
                    <div className={`${styles.baCell} ${styles.baBefore}`}>
                      <span className={styles.baLabel}>{locale === 'id' ? 'Sebelum' : 'Before'}</span>
                      <span className={styles.baText}>{item.before}</span>
                    </div>
                    <div className={styles.baArrow} aria-hidden="true">
                      <ArrowRight size={20} strokeWidth={2} />
                    </div>
                    <div className={`${styles.baCell} ${styles.baAfter}`}>
                      <span className={styles.baLabel}>{locale === 'id' ? 'Setelah' : 'After'}</span>
                      <span className={styles.baText}>{item.after}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className={styles.executiveInsight}>
              <span className={styles.executiveInsightLabel}>{locale === 'id' ? 'Wawasan Eksekutif' : 'Executive Insight'}</span>
              {improvementsInsight}
            </div>
          </div>
        )}

        {/* ── Business Context — 2-column free-flow ── */}
        <div id="section-business-context" className={styles.card}>
          <h2 className={styles.sectionLabel}>{locale === 'id' ? 'Konteks Bisnis' : 'Business Context'}</h2>
          <div className={styles.contextColumns}>

            {/* Left column */}
            <div className={styles.contextCol}>
              <div className={styles.contextItem}>
                <span className={styles.contextLabel}>{locale === 'id' ? 'Tujuan Utama' : 'Primary Objective'}</span>
                <span className={`${styles.contextValue} ${!qualitative.primaryObjective ? styles.notProvided : ''}`}>
                  {qualVal(qualitative.primaryObjective)}
                </span>
              </div>
              <div className={styles.contextItem}>
                <span className={styles.contextLabel}>Compliance</span>
                {qualitative.compliance && qualitative.compliance.length > 0 ? (
                  <span className={styles.contextValueBullet}>
                    <span className={styles.contextBulletIcon}>▶</span>
                    <span className={styles.contextValue}>{qualVal(qualitative.compliance, 'compliance_requirements')}</span>
                  </span>
                ) : (
                  <span className={`${styles.contextValue} ${styles.notProvided}`}>{locale === 'id' ? 'Belum diberikan' : 'Not provided'}</span>
                )}
              </div>
              <div className={styles.contextItem}>
                <span className={styles.contextLabel}>{locale === 'id' ? 'Kapabilitas AI' : 'AI Capability'}</span>
                <span className={`${styles.contextValue} ${!qualitative.aiCapability ? styles.notProvided : ''}`}>
                  {qualVal(qualitative.aiCapability, 'internal_capability')}
                </span>
              </div>
              <div className={styles.contextItem}>
                <span className={styles.contextLabel}>{locale === 'id' ? 'Percobaan AI Sebelumnya' : 'Prior AI Attempts'}</span>
                <span className={`${styles.contextValue} ${!qualitative.priorAIAttempts ? styles.notProvided : ''}`}>
                  {qualVal(qualitative.priorAIAttempts, 'prior_ai_attempts')}
                </span>
              </div>
              <div className={styles.contextItem}>
                <span className={styles.contextLabel}>{locale === 'id' ? 'Konsekuensi Keterlambatan' : 'Delay Consequence'}</span>
                <span className={`${styles.contextValue} ${!qualitative.delayConsequence ? styles.notProvided : ''}`}>
                  {qualVal(qualitative.delayConsequence, 'delay_consequence')}
                </span>
              </div>
              <div className={styles.contextItem}>
                <span className={styles.contextLabel}>{locale === 'id' ? 'Residensi Data' : 'Data Residency'}</span>
                <span className={`${styles.contextValue} ${!qualitative.dataResidency ? styles.notProvided : ''}`}>
                  {qualVal(qualitative.dataResidency, 'data_residency')}
                </span>
              </div>
              {/* Slice-2 optional answers — rendered only when provided so
                  contexts predating the questions look unchanged. */}
              {qualitative.processOwnership ? (
                <div className={styles.contextItem}>
                  <span className={styles.contextLabel}>{locale === 'id' ? 'Kepemilikan Proses' : 'Process Ownership'}</span>
                  <span className={styles.contextValue}>{qualVal(qualitative.processOwnership, 'process_ownership')}</span>
                </div>
              ) : null}
              {qualitative.kpiBaseline ? (
                <div className={styles.contextItem}>
                  <span className={styles.contextLabel}>{locale === 'id' ? 'Baseline KPI Operasional' : 'Operational KPI Baselines'}</span>
                  <span className={styles.contextValue}>{qualVal(qualitative.kpiBaseline)}</span>
                </div>
              ) : null}
            </div>

            {/* Right column */}
            <div className={styles.contextCol}>
              <div className={styles.contextItem}>
                <span className={styles.contextLabel}>{locale === 'id' ? 'Kendala Utama' : 'Top Pain Points'}</span>
                {qualitative.topPainPoints ? (
                  <ul className={styles.contextBulletList}>
                    {quantifyPainPoints({
                      topPainPoints: qualitative.topPainPoints,
                      painPointHours: qualitative.painPointHours,
                      hoursReclaimedPerYear: calculations.hoursReclaimedPerYear,
                      assumedHourlyRateLocal: calculations.assumedHourlyRateLocal,
                    }).map((item, i) => {
                      const hoursLabel = formatPainPointHours(item, locale)
                      const displayCost = displayPainPointCost(item)
                      const costLabel = displayCost != null ? fmtLocal(displayCost) : null
                      return (
                        <li key={i} className={styles.contextBulletItem}>
                          <span className={styles.contextBulletIcon}>▶</span>
                          <span className={styles.contextValue}>
                            {item.label}
                            {hoursLabel ? (
                              <>
                                {' — '}
                                <span className={styles.contextBulletFigure}>{hoursLabel}</span>
                                {costLabel ? ` (~${costLabel}/${locale === 'id' ? 'thn' : 'yr'})` : ''}
                              </>
                            ) : null}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <span className={`${styles.contextValue} ${styles.notProvided}`}>{locale === 'id' ? 'Belum diberikan' : 'Not provided'}</span>
                )}
              </div>
              <div className={styles.contextItem}>
                <span className={styles.contextLabel}>{locale === 'id' ? 'Pendekatan Implementasi' : 'Implementation Approach'}</span>
                <span className={`${styles.contextValue} ${!qualitative.implementApproach ? styles.notProvided : ''}`}>
                  {qualVal(qualitative.implementApproach, 'preferred_approach')}
                </span>
              </div>
              <div className={styles.contextItem}>
                <span className={styles.contextLabel}>{locale === 'id' ? 'Keselarasan Executive' : 'Leadership Alignment'}</span>
                <span className={`${styles.contextValue} ${!qualitative.leadershipAlignment ? styles.notProvided : ''}`}>
                  {qualVal(qualitative.leadershipAlignment, 'leadership_alignment')}
                </span>
              </div>
              <div className={styles.contextItem}>
                <span className={styles.contextLabel}>{locale === 'id' ? 'Sumber Resistensi' : 'Resistance Sources'}</span>
                <span className={`${styles.contextValue} ${!qualitative.resistanceSources || qualitative.resistanceSources.length === 0 ? styles.notProvided : ''}`}>
                  {qualVal(qualitative.resistanceSources)}
                </span>
              </div>
              <div className={styles.contextItem}>
                <span className={styles.contextLabel}>{locale === 'id' ? 'Toleransi Risiko' : 'Error Tolerance'}</span>
                <span className={`${styles.contextValue} ${!qualitative.errorTolerance ? styles.notProvided : ''}`}>
                  {qualVal(qualitative.errorTolerance, 'risk_tolerance')}
                </span>
              </div>
            </div>

          </div>
        </div>

        {/* ── AI Enablement (closing section) ── */}
        <div id="section-ai-enablement" className={styles.card}>
          <h2 className={styles.sectionLabel}>{locale === 'id' ? 'Pemanfaatan AI' : 'AI Enablement'}</h2>
          <p className={styles.aiEnablementText}>{aiEnablement}</p>
        </div>

        {/* ── Generate Blueprint CTA ── */}
        <div className={styles.blueprintCta}>
          <div className={styles.blueprintCtaLeft}>
            <h2 className={styles.blueprintCtaTitle}>{locale === 'id' ? 'Langkah berikutnya: Transformation Blueprint' : 'Next steps: Transformation Blueprint'}</h2>
            <p className={styles.blueprintCtaText}>
              {locale === 'id'
                ? 'Dengan hasil diagnostik ini, Transformation Blueprint Anda siap untuk dibuat. Beli Blueprint + Transformation Roadmap untuk mengubah wawasan ini menjadi arsitektur yang siap diterapkan dan rencana eksekusi yang dapat ditindaklanjuti.'
                : 'With this diagnostic result, your Transformation Blueprint is ready to generate. Purchase the Blueprint + Transformation Roadmap to transform these insights into a deployment-ready architecture and actionable execution plan.'}
            </p>
          </div>
          <div className={styles.blueprintCtaRight}>
            {isGeneratingBlueprint && (
              <div className={styles.blueprintProgress} role="progressbar" aria-valuenow={blueprintPercent} aria-valuemin={0} aria-valuemax={100}>
                <div className={styles.blueprintProgressTrack}>
                  <div className={styles.blueprintProgressFill} style={{ width: `${blueprintPercent}%` }} />
                </div>
                <div className={styles.blueprintProgressLabel}>
                  <span>{blueprintPercent}%</span>
                  <span>
                    {formatElapsed(blueprintElapsedSec)}
                    {' · '}
                    {locale === 'id' ? 'estimasi 1-2 menit' : 'estimated 1-2 min'}
                  </span>
                </div>
              </div>
            )}
            <button
              className={styles.generateBlueprintButton}
              onClick={handleGenerateBlueprint}
              disabled={isGeneratingBlueprint}
            >
              {isGeneratingBlueprint ? (locale === 'id' ? 'Membuat...' : 'Generating...') : (locale === 'id' ? 'Buat Blueprint' : 'Generate Blueprint')}
            </button>
            <span className={styles.blueprintPrice}>{locale === 'id' ? '$249 Sekali bayar' : '$249 One time'}</span>
            <button
              type="button"
              className={styles.advisoryLink}
              onClick={() => setIsAdvisoryModalOpen(true)}
            >
              {locale === 'id' ? 'Ingin penjelasan langsung? Bicara dengan tim advisory kami →' : 'Prefer a guided walkthrough? Talk to our advisory team →'}
            </button>
          </div>
        </div>

      </div>

      <SectionNavRail sections={navSections} locale={locale} />
      </div>

      {/* Hidden printable layout for PDF generation */}
      <div id="pdf-print-layout" style={{ display: 'none' }}>
        <PrintableReport context={context} llmResult={llmResult ?? undefined} />
      </div>

      <AdvisoryContactModal
        open={isAdvisoryModalOpen}
        onClose={() => setIsAdvisoryModalOpen(false)}
        companyName={context.company}
        locale={locale}
      />
    </div>
  )
}
