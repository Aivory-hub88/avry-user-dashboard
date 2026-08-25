/**
 * Roadmap generation — shared by the enqueue route
 * (app/api/roadmap/generate/route.ts) and the poll route
 * (app/api/roadmap/result/[jobId]/route.ts), plus the client-side
 * enqueue+poll helper used by app/roadmap/page.tsx and
 * app/blueprint/page.tsx.
 *
 * 2026-08-25: moved off a single synchronous held request through the
 * bridge's /console/stream (70s+ measured live, hard 90/95s timeouts, silent
 * generic-template fallback under load) to the same BullMQ enqueue+poll
 * pattern blueprints have used since 2026-08-09 — see
 * AVRY/vps-bridge/lib/roadmapQueue.js for the generation ladder.
 */
import type { AiryRoadmap } from '@/types/roadmap'
import { asset } from '@/lib/asset'
import { formatLocalAmount, parseCurrencyCode, type CurrencyCode } from '@/lib/resultFormatters'

// ─────────────────────────────────────────────────────────────────────────────
// Prompt building (server-side)
// ─────────────────────────────────────────────────────────────────────────────

export function buildRoadmapPrompt(
  diagnosticContext: Record<string, any>,
  blueprintContext: Record<string, any>,
  locale: 'en' | 'id',
): string {
  const contextParts: string[] = []

  if (diagnosticContext && Object.keys(diagnosticContext).length > 0) {
    contextParts.push(`DIAGNOSTIC RESULTS:\n${JSON.stringify(diagnosticContext, null, 2)}`)
  }

  if (blueprintContext && Object.keys(blueprintContext).length > 0) {
    contextParts.push(`BLUEPRINT DATA:\n${JSON.stringify(blueprintContext, null, 2)}`)
  }

  if (contextParts.length === 0) {
    contextParts.push('No diagnostic or blueprint data provided. Generate a generic business operations transformation roadmap for an SME.')
  }

  return `You are a business operations transformation consultant. Based on the following context, generate a phased transformation roadmap, with AI positioned as the execution layer where it accelerates the plan.

${contextParts.join('\n\n')}

Return ONLY valid JSON matching this exact schema (no markdown, no explanation):
{
  "id": "<uuid>",
  "title": "<roadmap title>",
  "createdAt": "<ISO timestamp>",
  "phases": [
    {
      "id": "phase-1",
      "name": "<phase name>",
      "timeframe": "<e.g. Month 1-3>",
      "description": "<brief description>",
      "milestones": [
        {
          "id": "m-1-1",
          "title": "<milestone title>",
          "description": "<optional detail>",
          "linkedWorkflowIds": []
        }
      ],
      "kpis": [
        {
          "id": "kpi-1-1",
          "label": "<metric name>",
          "target": "<target value>"
        }
      ]
    }
  ]
}

Generate 3-4 phases. Each phase should have 2-4 milestones and 2-3 KPIs. Be specific and actionable.

GROUNDING RULES (do not violate): every KPI "target" value must trace back to a field that is actually present in the DIAGNOSTIC RESULTS or BLUEPRINT DATA above — do not invent a number. Prefer these pre-computed fields verbatim, never recompute or approximate them: "calculations.totalAnnualSavingsLocal", "calculations.paybackMonths"/"netPaybackMonths", "calculations.threeYearROIPercent"/"netThreeYearROIPercent", "calculations.hoursReclaimedPerYear", and "quantitative.targetAutomationPct"/"currentAutomationPct" (the user's own answers). If none of these fields are present in the context above for a given KPI, use qualitative language (e.g. "meaningful reduction in manual hours") instead of a specific invented number.${locale === 'id' ? `

LANGUAGE: Write every freeform narrative/text field VALUE in formal Bahasa Indonesia (business register) — this includes "title", "phases[].name", "phases[].timeframe", "phases[].description", "phases[].milestones[].title/description", and "phases[].kpis[].label/target". Do NOT translate the fixed "id" slug fields ("phases[].id", "milestones[].id", "kpis[].id") — keep those exactly as specified in the schema. Currency figures and dollar amounts stay as-is (do not convert currency).` : ''}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Response parsing (server-side, poll route)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse the model's raw completion into an AiryRoadmap. Throws when the text
 * carries no JSON or the JSON has no usable phases — the poll route turns a
 * throw into the flagged generic fallback, never a silent empty roadmap.
 */
export function parseRoadmapContent(
  rawText: string,
  source: string,
  blueprintId: string | undefined,
  locale: 'en' | 'id',
): AiryRoadmap {
  const jsonMatch = rawText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON found in AI response')

  const parsed = JSON.parse(jsonMatch[0]) as Partial<AiryRoadmap>

  // The model can return syntactically valid JSON with nothing useful in
  // it (e.g. "phases": []) — that parses fine and would otherwise reach the
  // caller with zero real content and no fallback_generated flag.
  const phases = Array.isArray(parsed.phases) ? parsed.phases : []
  if (phases.length === 0) {
    throw new Error('AI response parsed but contained no phases')
  }

  return {
    id: parsed.id || `roadmap-${Date.now()}`,
    title: parsed.title || (locale === 'id' ? 'Roadmap Transformasi' : 'Transformation Roadmap'),
    createdAt: new Date().toISOString(),
    source: source as AiryRoadmap['source'],
    blueprintId,
    phases,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic fallback (server-side, poll route) — flagged, never silent
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The fallback roadmap's KPI targets used to be hardcoded placeholders
 * ("3x investment", "40%", "10+ hours") that read to a user exactly like
 * computed figures even though this path only runs when the AI call
 * failed. Ground them in the diagnostic engine's own fields when present;
 * fall back to qualitative language (never an invented number) otherwise.
 * See §1.6 row 11 of DEEP-DIAGNOSTIC-EXPERIENCE-V2-PLANNING.md.
 */
function deriveFallbackKpiTargets(diagnosticContext: Record<string, any>, locale: 'en' | 'id' = 'en') {
  const calc = diagnosticContext?.calculations
  const quant = diagnosticContext?.quantitative
  const currencyCode: CurrencyCode = parseCurrencyCode(diagnosticContext?.currency)
  const tr = (en: string, id: string) => locale === 'id' ? id : en

  const hoursSavedPerWeek = typeof calc?.hoursReclaimedPerYear === 'number'
    ? `${Math.max(1, Math.round(calc.hoursReclaimedPerYear / 52))}+ ${tr('hours', 'jam')}`
    : tr('Meaningful reduction in manual hours', 'Pengurangan berarti pada jam kerja manual')

  const automationCoverage = typeof quant?.targetAutomationPct === 'number'
    ? `${quant.targetAutomationPct}%`
    : tr('Increased automation coverage', 'Peningkatan cakupan otomasi')

  const roiOutcome = typeof calc?.netThreeYearROIPercent === 'number'
    ? `${Math.max(0, Math.round(calc.netThreeYearROIPercent))}% ${tr('3-yr ROI', 'ROI 3 tahun')}`
    : typeof calc?.totalAnnualSavingsLocal === 'number'
      ? `${formatLocalAmount(calc.totalAnnualSavingsLocal, currencyCode)}${tr('/yr savings', '/thn penghematan')}`
      : tr('Positive return on automation investment', 'Imbal hasil positif atas investasi otomasi')

  return { hoursSavedPerWeek, automationCoverage, roiOutcome }
}

export function buildFallbackRoadmap(
  source: string,
  blueprintId: string | undefined,
  diagnosticContext: Record<string, any> = {},
  locale: 'en' | 'id' = 'en',
): AiryRoadmap {
  const kpiTargets = deriveFallbackKpiTargets(diagnosticContext, locale)
  const tr = (en: string, id: string) => locale === 'id' ? id : en
  return {
    id: `roadmap-${Date.now()}`,
    title: tr('Transformation Roadmap', 'Roadmap Transformasi'),
    createdAt: new Date().toISOString(),
    source: source as AiryRoadmap['source'],
    blueprintId,
    phases: [
      {
        id: 'phase-1',
        name: tr('Foundation & Quick Wins', 'Fondasi & Kemenangan Cepat'),
        timeframe: tr('Month 1–3', 'Bulan 1–3'),
        description: tr('Establish data infrastructure and deploy first automation workflows.', 'Membangun infrastruktur data dan menerapkan alur kerja otomasi pertama.'),
        milestones: [
          { id: 'm-1-1', title: tr('Audit existing data sources and integrations', 'Audit sumber data dan integrasi yang ada'), linkedWorkflowIds: [] },
          { id: 'm-1-2', title: tr('Deploy first automated workflow (highest ROI)', 'Terapkan alur kerja terotomasi pertama (ROI tertinggi)'), linkedWorkflowIds: [] },
          { id: 'm-1-3', title: tr('Train team on AI tools and processes', 'Latih tim mengenai alat dan proses AI'), linkedWorkflowIds: [] },
        ],
        kpis: [
          { id: 'kpi-1-1', label: tr('Manual tasks automated', 'Tugas manual terotomasi'), target: '3+' },
          { id: 'kpi-1-2', label: tr('Time saved per week', 'Waktu yang dihemat per minggu'), target: kpiTargets.hoursSavedPerWeek },
        ],
      },
      {
        id: 'phase-2',
        name: tr('Scale & Integrate', 'Skalakan & Integrasikan'),
        timeframe: tr('Month 4–6', 'Bulan 4–6'),
        description: tr('Expand automation coverage and integrate AI into core business processes.', 'Perluas cakupan otomasi dan integrasikan AI ke proses bisnis inti.'),
        milestones: [
          { id: 'm-2-1', title: tr('Connect CRM and communication tools', 'Hubungkan CRM dan alat komunikasi'), linkedWorkflowIds: [] },
          { id: 'm-2-2', title: tr('Deploy AI-assisted decision workflows', 'Terapkan alur kerja keputusan berbantuan AI'), linkedWorkflowIds: [] },
          { id: 'm-2-3', title: tr('Establish monitoring and alerting', 'Bangun pemantauan dan pemberitahuan'), linkedWorkflowIds: [] },
        ],
        kpis: [
          { id: 'kpi-2-1', label: tr('Workflows in production', 'Alur kerja di produksi'), target: '5+' },
          { id: 'kpi-2-2', label: tr('Automation coverage', 'Cakupan otomasi'), target: kpiTargets.automationCoverage },
        ],
      },
      {
        id: 'phase-3',
        name: tr('Optimise & Measure', 'Optimalkan & Ukur'),
        timeframe: tr('Month 7–12', 'Bulan 7–12'),
        description: tr('Refine workflows based on data, measure ROI, and plan next expansion.', 'Sempurnakan alur kerja berdasarkan data, ukur ROI, dan rencanakan ekspansi berikutnya.'),
        milestones: [
          { id: 'm-3-1', title: tr('Review KPI performance and optimise workflows', 'Tinjau kinerja KPI dan optimalkan alur kerja'), linkedWorkflowIds: [] },
          { id: 'm-3-2', title: tr('Identify next automation opportunities', 'Identifikasi peluang otomasi berikutnya'), linkedWorkflowIds: [] },
          { id: 'm-3-3', title: tr('Document learnings and update roadmap', 'Dokumentasikan pembelajaran dan perbarui roadmap'), linkedWorkflowIds: [] },
        ],
        kpis: [
          { id: 'kpi-3-1', label: tr('ROI achieved', 'ROI tercapai'), target: kpiTargets.roiOutcome },
          { id: 'kpi-3-2', label: tr('Team AI adoption rate', 'Tingkat adopsi AI tim'), target: '80%' },
        ],
      },
    ],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Client helper — enqueue + poll (browser)
// ─────────────────────────────────────────────────────────────────────────────

export interface GenerateRoadmapOptions {
  source: string
  diagnosticContext?: Record<string, any>
  blueprintContext?: Record<string, any>
  blueprintId?: string
  locale: 'en' | 'id'
  onProgress?: (elapsedMs: number) => void
}

export interface GenerateRoadmapResult {
  roadmap: AiryRoadmap
  fallbackGenerated: boolean
}

/**
 * Enqueue roadmap generation and poll until the result is ready.
 * Throws on enqueue failure, job failure, or the polling deadline.
 *
 * Deadline 600s: the bridge ladder's true worst case is attempts(2) ×
 * (fast 60s + fallback 180s + failover 60s) ≈ 600s, but realistic p95 is a
 * first-tier success in well under a minute. Poll every 4s — roadmap jobs
 * are short, so the tighter interval keeps perceived latency low.
 */
export async function generateRoadmapAsync(opts: GenerateRoadmapOptions): Promise<GenerateRoadmapResult> {
  const submitRes = await fetch(asset('/api/roadmap/generate'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: opts.source,
      blueprintId: opts.blueprintId,
      diagnosticContext: opts.diagnosticContext ?? {},
      blueprintContext: opts.blueprintContext ?? {},
      locale: opts.locale,
    }),
  })
  if (!submitRes.ok) {
    const error = await submitRes.json().catch(() => ({ message: 'Failed to generate roadmap' }))
    throw new Error(error.message || 'Failed to generate roadmap')
  }
  const queued = await submitRes.json().catch(() => ({} as any))
  const jobId = queued?.job_id
  if (!jobId) throw new Error('Invalid response format from server')

  const startedAt = Date.now()
  const deadline = startedAt + 600_000
  const POLL_INTERVAL_MS = 4_000
  opts.onProgress?.(0)

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
    opts.onProgress?.(Date.now() - startedAt)
    let pollRes: Response
    try {
      pollRes = await fetch(asset(`/api/roadmap/result/${jobId}`))
    } catch {
      continue // transient network blip — keep polling
    }
    if (!pollRes.ok) {
      const error = await pollRes.json().catch(() => ({ message: 'Roadmap generation failed' }))
      throw new Error(error.message || 'Roadmap generation failed')
    }
    const data = await pollRes.json().catch(() => ({} as any))
    if (data?.jobStatus && data.jobStatus !== 'completed') continue // still running
    if (!data?.roadmap) throw new Error('Roadmap generation returned no roadmap')
    return { roadmap: data.roadmap as AiryRoadmap, fallbackGenerated: !!data.fallback_generated }
  }
  throw new Error('Roadmap generation timed out. Please try again.')
}
