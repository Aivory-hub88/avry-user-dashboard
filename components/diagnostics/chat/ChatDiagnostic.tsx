'use client'

/**
 * Chat-style Deep Diagnostic (prototype).
 *
 * Scripted conversation over the SAME question set, validation, storage keys
 * and band/currency rules as the form at /diagnostics/deep — no LLM per turn,
 * so scoring and stored answers are identical. Finishing routes to the same
 * /diagnostics/deep/summary page.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PhaseData, PhaseId, DeepDiagnosticProgress, DeepDiagnosticQuestion } from '@/types/deepDiagnostic'
import { DEEP_DIAGNOSTIC_PHASES, EN_OPTION_DISPLAY } from '@/constants/deepDiagnosticQuestions'
import { ID_PHASE_COPY, ID_QUESTION_COPY } from '@/constants/deepDiagnosticQuestionsId'
import { DeepDiagnosticService } from '@/services/deepDiagnostic'
import { normalizeWebsiteInput } from '@/lib/websiteUrl'
import { dropMismatchedBandAnswers, getBudgetBands, getRevenueBands } from '@/lib/currencyBands'
import { parseCurrencyCode } from '@/lib/resultFormatters'
import { useLocaleContext } from '@/hooks/useLocale'
import styles from './ChatDiagnostic.module.css'

const PHASE_ORDER: PhaseId[] = [
  'business_objective_kpi',
  'data_process_readiness',
  'risk_constraints',
  'ai_opportunity_mapping',
]

type Locale = 'en' | 'id'
type PhaseMap = Record<PhaseId, PhaseData>

interface Step {
  key: string
  kind: 'company' | 'website' | 'question'
  phase: PhaseId
  q?: DeepDiagnosticQuestion
}

interface Opt { value: string; label: string }

const emptyPhases = (): PhaseMap =>
  PHASE_ORDER.reduce((acc, id) => {
    acc[id] = { completed: false, responses: {} }
    return acc
  }, {} as PhaseMap)

const STEPS: Step[] = [
  { key: '_company', kind: 'company', phase: PHASE_ORDER[0] },
  { key: '_website', kind: 'website', phase: PHASE_ORDER[0] },
  ...DEEP_DIAGNOSTIC_PHASES.flatMap(p =>
    p.questions.map<Step>(q => ({ key: q.id, kind: 'question', phase: p.id as PhaseId, q }))
  ),
]

const COPY = {
  en: {
    title: 'Deep Diagnostic',
    hello: 'Welcome to the Aivory Deep Diagnostic. Over four phases we will assess how your business operates today — objectives, data and processes, risks, and bottlenecks — and use your answers to prepare your analysis report. You can revise any answer at any time.',
    askCompany: "Let's begin. What is your company's name?",
    askWebsite: 'Do you have a company website? I can read its public pages to make the analysis more accurate. It does not change your score.',
    companyPh: 'Company name…',
    websitePh: 'e.g. yourcompany.com',
    send: 'Send',
    skip: 'Skip',
    next: 'Continue',
    filter: 'Search…',
    typeHere: 'Type your answer…',
    skipped: 'Skipped',
    phase: 'Phase',
    captured: 'What we captured',
    nothing: 'Your answers will appear here as we go.',
    progress: 'Progress',
    summary: 'Summary',
    close: 'Close',
    resumeAsk: 'You have saved progress. Pick up where you left off?',
    resume: 'Resume',
    fresh: 'Start fresh',
    freshConfirm: 'Start fresh? All saved progress will be lost.',
    done: "That's everything. I have what I need to build your report.",
    finish: 'Review & finish',
    edit: 'Tap to edit',
    selectedCount: (n: number) => `${n} selected`,
    pickDropdown: 'Choose from the list',
    selectPh: 'Select an option…',
    pickOne: 'Pick one · press 1–9',
    pickMany: 'Pick all that apply · press 1–9',
    editing: 'Editing this answer',
    cancel: 'Cancel',
    saveEdit: 'Save change',
    required: 'This one is required.',
    companyReq: 'Company name is required.',
    websiteBad: 'That address looks invalid. Skip it if you have none.',
    ackCompany: (n: string) => `Nice to meet ${n}.`,
    ackWebsite: "Got it. I'll read your public pages in the background.",
    ackNoTarget: "No problem — we'll explore first, so I'll skip the target-metrics question.",
    phaseDone: (n: number, a: number, t: number) => `Phase ${n} done — ${a} of ${t} answered.`,
    doneSummary: (a: number, t: number) => `All four phases complete — ${a} of ${t} questions answered.`,
    langLabel: 'Language',
    facts: {
      operating_country: 'Country',
      industry: 'Industry',
      company_size: 'Size',
      currency: 'Currency',
      annual_revenue: 'Revenue',
      primary_objective: 'Main goal',
      fte_count: 'Team in scope',
      hourly_cost: 'Hourly cost',
      budget_range: 'Budget',
    } as Record<string, string>,
  },
  id: {
    title: 'Deep Diagnostic',
    hello: 'Selamat datang di Aivory Deep Diagnostic. Dalam empat fase, kami akan menilai cara bisnis Anda beroperasi saat ini — tujuan, data dan proses, risiko, serta hambatan — lalu menyusun jawaban Anda menjadi laporan analisis. Anda dapat mengubah jawaban kapan saja.',
    askCompany: 'Mari kita mulai. Siapa nama perusahaan Anda?',
    askWebsite: 'Apakah perusahaan Anda punya website? Saya bisa membaca halaman publiknya agar analisis lebih akurat. Tidak mengubah skor.',
    companyPh: 'Nama perusahaan…',
    websitePh: 'contoh: perusahaananda.co.id',
    send: 'Kirim',
    skip: 'Lewati',
    next: 'Lanjut',
    filter: 'Cari…',
    typeHere: 'Ketik jawaban Anda…',
    skipped: 'Dilewati',
    phase: 'Fase',
    captured: 'Yang kami tangkap',
    nothing: 'Jawaban Anda akan muncul di sini.',
    progress: 'Progres',
    summary: 'Ringkasan',
    close: 'Tutup',
    resumeAsk: 'Anda punya progres tersimpan. Lanjutkan dari terakhir?',
    resume: 'Lanjutkan',
    fresh: 'Mulai baru',
    freshConfirm: 'Mulai dari awal? Semua progres tersimpan akan hilang.',
    done: 'Itu semuanya. Saya sudah punya cukup data untuk menyusun laporan Anda.',
    finish: 'Tinjau & selesai',
    edit: 'Ketuk untuk ubah',
    selectedCount: (n: number) => `${n} dipilih`,
    pickDropdown: 'Pilih dari daftar',
    selectPh: 'Pilih salah satu…',
    pickOne: 'Pilih satu · tekan 1–9',
    pickMany: 'Pilih semua yang sesuai · tekan 1–9',
    editing: 'Mengubah jawaban ini',
    cancel: 'Batal',
    saveEdit: 'Simpan perubahan',
    required: 'Pertanyaan ini wajib diisi.',
    companyReq: 'Nama perusahaan wajib diisi.',
    websiteBad: 'Alamat tidak valid. Lewati jika tidak ada.',
    ackCompany: (n: string) => `Senang berkenalan dengan ${n}.`,
    ackWebsite: 'Siap. Saya baca halaman publiknya di latar belakang.',
    ackNoTarget: 'Tidak apa-apa — kita eksplor dulu, jadi pertanyaan target metrik saya lewati.',
    phaseDone: (n: number, a: number, t: number) => `Fase ${n} selesai — ${a} dari ${t} terjawab.`,
    doneSummary: (a: number, t: number) => `Keempat fase selesai — ${a} dari ${t} pertanyaan terjawab.`,
    langLabel: 'Bahasa',
    facts: {
      operating_country: 'Negara',
      industry: 'Industri',
      company_size: 'Ukuran',
      currency: 'Mata uang',
      annual_revenue: 'Pendapatan',
      primary_objective: 'Tujuan utama',
      fte_count: 'Tim dalam cakupan',
      hourly_cost: 'Upah per jam',
      budget_range: 'Anggaran',
    } as Record<string, string>,
  },
}

const FACT_KEYS = [
  'operating_country', 'industry', 'company_size', 'currency', 'annual_revenue',
  'primary_objective', 'fte_count', 'hourly_cost', 'budget_range',
]

function getOptions(q: DeepDiagnosticQuestion, responses: Record<string, any>, locale: Locale): Opt[] {
  if (!q.options) return []
  if (q.id === 'annual_revenue' || q.id === 'budget_range') {
    const code = parseCurrencyCode(responses['currency'])
    const bands = q.id === 'annual_revenue' ? getRevenueBands(code) : getBudgetBands(code)
    return bands.map(b => ({ value: b.en, label: locale === 'id' ? b.id : b.en }))
  }
  const t = locale === 'id' ? ID_QUESTION_COPY[q.id] : undefined
  return q.options.map((o, i) => ({ value: o, label: t?.options?.[i] ?? EN_OPTION_DISPLAY[o] ?? o }))
}

/**
 * Split an option label into a bold title and a muted description, so choices
 * read like option cards: "Micro (2–10 employees)" → Micro / 2–10 employees,
 * "USD — US Dollar ($)" → USD / US Dollar ($). Display only; the stored value
 * stays the canonical option string.
 */
function splitLabel(label: string, plain: boolean): { title: string; desc?: string } {
  if (plain) return { title: label }
  const dash = label.split(' — ')
  if (dash.length >= 2) return { title: dash[0].trim(), desc: dash.slice(1).join(' — ').trim() }
  const m = label.match(/^(.*?)\s*\(([^()]{4,})\)\s*$/)
  if (m && m[1]) return { title: m[1].trim(), desc: m[2].trim() }
  return { title: label }
}

function questionText(q: DeepDiagnosticQuestion, locale: Locale) {
  return (locale === 'id' ? ID_QUESTION_COPY[q.id]?.question : undefined) ?? q.question
}

function isEmpty(v: any) {
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0) ||
    (typeof v === 'string' && v.trim() === '')
}

function isSkipped(step: Step, phases: PhaseMap) {
  return step.q?.id === 'target_metrics' &&
    String(phases.business_objective_kpi.responses.quantified_goal ?? '').startsWith('No')
}

export default function ChatDiagnostic() {
  const router = useRouter()
  const { locale, setLocale } = useLocaleContext()
  const L = locale as Locale
  const c = COPY[L]

  const [ready, setReady] = useState(false)
  const [phases, setPhases] = useState<PhaseMap>(emptyPhases)
  const [companyName, setCompanyName] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [cursor, setCursor] = useState(0)
  const [editKey, setEditKey] = useState<string | null>(null)
  const [typing, setTyping] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState<DeepDiagnosticProgress | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const [draft, setDraft] = useState<any>('')
  const [filter, setFilter] = useState('')
  const [ddOpen, setDdOpen] = useState(false)
  const ddRef = useRef<HTMLDivElement | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null)
  const firstSave = useRef(true)

  // ── mount: stage saved progress behind an explicit Resume choice ──
  useEffect(() => {
    try {
      const p = DeepDiagnosticService.loadProgress()
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (p) setSaved(p)
    } catch { /* storage unavailable */ }
    setReady(true)
  }, [])

  const getValue = useCallback((s: Step, ph: PhaseMap = phases) => {
    if (s.kind === 'company') return companyName
    if (s.kind === 'website') return websiteUrl
    return ph[s.phase].responses[s.q!.id]
  }, [phases, companyName, websiteUrl])

  const current: Step | undefined = STEPS[cursor]
  const activeStep: Step | undefined = editKey ? STEPS.find(s => s.key === editKey) : current

  // ── autosave (same storage as the form) ──
  useEffect(() => {
    if (firstSave.current) { firstSave.current = false; return }
    const t = setTimeout(() => {
      try {
        DeepDiagnosticService.saveProgress({
          phases,
          currentPhase: (current ?? STEPS[STEPS.length - 1]).phase,
          lastUpdated: new Date().toISOString(),
          companyName,
          websiteUrl,
        })
      } catch { /* ignore */ }
    }, 500)
    return () => clearTimeout(t)
  }, [phases, cursor, companyName, websiteUrl, current])

  // ── typing indicator whenever a new question arrives ──
  useEffect(() => {
    if (!ready) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTyping(true)
    const t = setTimeout(() => setTyping(false), cursor === 0 ? 350 : 550)
    return () => clearTimeout(t)
  }, [cursor, ready])

  // ── reset draft when the active step changes ──
  const activeKey = activeStep?.key
  useEffect(() => {
    if (!activeStep) return
    const v = getValue(activeStep)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(isEmpty(v) ? (activeStep.q?.type === 'multiselect' ? [] : '') : v)
    setFilter('')
    setDdOpen(false)
    setError('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey])

  // close the dropdown on outside click / Escape
  useEffect(() => {
    if (!ddOpen) return
    const onDown = (e: MouseEvent) => {
      if (ddRef.current && !ddRef.current.contains(e.target as Node)) setDdOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setDdOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onEsc)
    }
  }, [ddOpen])

  // ── keep the latest message in view ──
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    // the composer mounts a beat later and shrinks the scroll area: settle again
    const t = setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 120)
    return () => clearTimeout(t)
  }, [cursor, typing, editKey, saved])

  useEffect(() => {
    if (!typing) inputRef.current?.focus({ preventScroll: true })
  }, [typing, activeKey])


  // ── derived: visible steps / counts ──
  const visibleIdx = useMemo(
    () => STEPS.map((s, i) => i).filter(i => !isSkipped(STEPS[i], phases)),
    [phases]
  )

  const nextIndex = (from: number, ph: PhaseMap) => {
    let i = from + 1
    while (i < STEPS.length && isSkipped(STEPS[i], ph)) i++
    return i
  }

  const phaseStats = PHASE_ORDER.map(id => {
    const idxs = visibleIdx.filter(i => STEPS[i].phase === id)
    const answered = idxs.filter(i => i < cursor).length
    return { id, total: idxs.length, answered }
  })
  const totalVisible = visibleIdx.length
  const answeredVisible = visibleIdx.filter(i => i < cursor).length
  const pct = Math.round((answeredVisible / totalVisible) * 100)

  // ── display helpers ──
  const display = (s: Step, ph: PhaseMap = phases): string => {
    const v = getValue(s, ph)
    if (isEmpty(v)) return c.skipped
    if (s.kind !== 'question') return String(v)
    const opts = getOptions(s.q!, ph[s.phase].responses, L)
    if (Array.isArray(v)) return v.map(x => opts.find(o => o.value === x)?.label ?? x).join(', ')
    const hit = opts.find(o => o.value === v)
    if (hit) return hit.label
    if (s.q!.id === 'hourly_cost') return `${v}`
    return String(v)
  }

  const stepPrompt = (s: Step) =>
    s.kind === 'company' ? c.askCompany : s.kind === 'website' ? c.askWebsite : questionText(s.q!, L)

  const stepHelper = (s: Step) =>
    s.kind === 'question'
      ? ((L === 'id' ? ID_QUESTION_COPY[s.q!.id]?.helperText : undefined) ?? s.q!.helperText)
      : undefined

  const ack = (s: Step): string | null => {
    if (s.kind === 'company') return companyName.trim() ? c.ackCompany(companyName.trim()) : null
    if (s.kind === 'website') return websiteUrl.trim() ? c.ackWebsite : null
    if (s.q!.id === 'quantified_goal' && String(getValue(s) ?? '').startsWith('No')) return c.ackNoTarget
    return null
  }

  // ── validation ──
  const validate = (s: Step, value: any): string => {
    if (s.kind === 'company') return String(value).trim() ? '' : c.companyReq
    if (s.kind === 'website') {
      return String(value).trim() && !normalizeWebsiteInput(String(value)) ? c.websiteBad : ''
    }
    const errs = DeepDiagnosticService.validatePhase(
      { id: s.phase, title: '', description: '', questions: [s.q!] },
      { [s.q!.id]: value }
    )
    const e = errs[s.q!.id]
    if (!e) return ''
    if (e === 'This field is required' || e === 'Please select at least one option') return c.required
    return e
  }

  // ── commit an answer ──
  const commit = (s: Step, rawValue: any, skip = false) => {
    const value = skip ? (s.q?.type === 'multiselect' ? [] : '') : rawValue
    if (!skip) {
      const e = validate(s, value)
      if (e) { setError(e); return }
    }
    setError('')

    let nextPhases = phases
    if (s.kind === 'company') setCompanyName(String(value).trim())
    else if (s.kind === 'website') setWebsiteUrl(String(value).trim())
    else {
      const qid = s.q!.id
      nextPhases = {
        ...phases,
        [s.phase]: { ...phases[s.phase], responses: { ...phases[s.phase].responses, [qid]: value } },
      }
      if (isEmpty(value)) delete nextPhases[s.phase].responses[qid]
      if (qid === 'currency') {
        nextPhases = dropMismatchedBandAnswers(nextPhases, parseCurrencyCode(value)) as PhaseMap
      }
    }

    const idx = STEPS.indexOf(s)

    if (editKey) {
      // Edit mode: stay where we are, unless the change invalidated an earlier required answer.
      setPhases(nextPhases)
      setEditKey(null)
      const missing = STEPS.findIndex((st, i) =>
        i < cursor && !isSkipped(st, nextPhases) && st.kind === 'question' && st.q!.required &&
        isEmpty(getValueFrom(st, nextPhases, s, value))
      )
      if (missing !== -1) setCursor(missing)
      return
    }

    const ni = nextIndex(idx, nextPhases)
    const leavingPhase = ni >= STEPS.length || STEPS[ni].phase !== s.phase
    if (leavingPhase) {
      nextPhases = { ...nextPhases, [s.phase]: { ...nextPhases[s.phase], completed: true } }
    }
    setPhases(nextPhases)
    setCursor(ni)
  }

  // value lookup that honours a just-committed company/website value
  const getValueFrom = (st: Step, ph: PhaseMap, changed: Step, changedValue: any) => {
    if (st.kind === 'company') return changed.kind === 'company' ? changedValue : companyName
    if (st.kind === 'website') return changed.kind === 'website' ? changedValue : websiteUrl
    return ph[st.phase].responses[st.q!.id]
  }

  // ── keyboard: 1–9 picks the numbered option card ──
  const choiceType = activeStep?.kind === 'question' ? activeStep.q!.type : null
  const isChoice = choiceType === 'radio' || choiceType === 'multiselect'
  useEffect(() => {
    if (!isChoice || !activeStep || typing) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const n = Number(e.key)
      if (!Number.isInteger(n) || n < 1 || n > 9) return
      const opts = getOptions(activeStep.q!, phases[activeStep.phase].responses, L)
      const o = opts[n - 1]
      if (!o) return
      e.preventDefault()
      if (choiceType === 'multiselect') {
        setDraft((d: any) => {
          const cur: string[] = Array.isArray(d) ? d : []
          return cur.includes(o.value) ? cur.filter(v => v !== o.value) : [...cur, o.value]
        })
        setError('')
      } else {
        commit(activeStep, o.value)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isChoice, activeKey, typing, phases, L, choiceType, cursor, editKey])

  const handleResume = () => {
    if (!saved) return
    const merged = { ...emptyPhases(), ...saved.phases }
    const code = parseCurrencyCode(merged.business_objective_kpi?.responses?.currency)
    const cleaned = dropMismatchedBandAnswers(merged, code) as PhaseMap
    const name = saved.companyName ?? ''
    const site = saved.websiteUrl ?? ''
    setPhases(cleaned)
    setCompanyName(name)
    setWebsiteUrl(site)
    const firstMissing = STEPS.findIndex(st => {
      if (isSkipped(st, cleaned)) return false
      if (st.kind === 'company') return !name.trim()
      if (st.kind === 'website') return false
      return st.q!.required && isEmpty(cleaned[st.phase].responses[st.q!.id])
    })
    setCursor(firstMissing === -1 ? STEPS.length : firstMissing)
    setSaved(null)
  }

  const handleFresh = () => {
    if (!window.confirm(c.freshConfirm)) return
    DeepDiagnosticService.clearProgress()
    try { localStorage.removeItem('aivory_diagnostic_context') } catch { /* ignore */ }
    setPhases(emptyPhases())
    setCompanyName('')
    setWebsiteUrl('')
    setCursor(0)
    setEditKey(null)
    setSaved(null)
  }

  const finish = () => {
    const all = PHASE_ORDER.reduce((acc, id) => {
      acc[id] = { ...phases[id], completed: true }
      return acc
    }, {} as PhaseMap)
    DeepDiagnosticService.saveProgress({
      phases: all,
      currentPhase: PHASE_ORDER[PHASE_ORDER.length - 1],
      lastUpdated: new Date().toISOString(),
      companyName,
      websiteUrl,
    })
    router.push('/diagnostics/deep/summary')
  }

  // ── composer ──
  const renderComposer = () => {
    if (!activeStep) return null
    const s = activeStep
    const isEdit = !!editKey
    const optional = s.kind === 'website' || (s.kind === 'question' && !s.q!.required)
    const type = s.kind === 'question' ? s.q!.type : 'text'

    const footer = (
      <div className={styles.composerFoot}>
        {error && <span className={styles.err} role="alert">{error}</span>}
        <span className={styles.spacer} />
        {isEdit && (
          <button type="button" className={styles.ghost} onClick={() => setEditKey(null)}>{c.cancel}</button>
        )}
        {optional && !isEdit && (
          <button type="button" className={styles.ghost} onClick={() => commit(s, '', true)}>{c.skip}</button>
        )}
      </div>
    )

    // `select` questions keep the form's dropdown; picking a value sends it.
    if (type === 'select') {
      const opts = getOptions(s.q!, phases[s.phase].responses, L)
      const qNum = STEPS.filter((x, i) => x.phase === s.phase && !isSkipped(x, phases) && i <= STEPS.indexOf(s)).length
      const qTotal = STEPS.filter(x => x.phase === s.phase && !isSkipped(x, phases)).length
      return (
        <div className={styles.composer}>
          <div className={styles.cardHead}>
            <span className={styles.chip}>
              {c.phase} {PHASE_ORDER.indexOf(s.phase) + 1} · {qNum}/{qTotal}
            </span>
            <span className={styles.hint}>{c.pickDropdown}</span>
            {isEdit && <span className={styles.editTag}>{c.editing}</span>}
          </div>
          {/* Custom dropdown that always opens UPWARD: the composer sits at the
              bottom of the viewport, where a native <select> popup gets clipped. */}
          <div className={styles.ddWrap} ref={ddRef}>
            <button
              type="button"
              ref={el => { inputRef.current = el as any }}
              className={`${styles.select} ${ddOpen ? styles.selectOpen : ''}`}
              aria-haspopup="listbox"
              aria-expanded={ddOpen}
              aria-label={questionText(s.q!, L)}
              onClick={() => { setDdOpen(o => !o); setFilter('') }}
            >
              <span className={draft ? '' : styles.selectPh}>
                {opts.find(o => o.value === draft)?.label ?? c.selectPh}
              </span>
            </button>
            {ddOpen && (
              <div className={styles.ddPanel} role="listbox">
                <input
                  autoFocus
                  className={styles.ddSearch}
                  placeholder={c.filter}
                  value={filter}
                  onChange={e => setFilter(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Escape') { setDdOpen(false); return }
                    if (e.key === 'Enter') {
                      const first = opts.filter(o => o.label.toLowerCase().includes(filter.toLowerCase()))[0]
                      if (first) { setDdOpen(false); commit(s, first.value) }
                    }
                  }}
                />
                <div className={styles.ddList}>
                  {opts
                    .filter(o => !filter || o.label.toLowerCase().includes(filter.toLowerCase()))
                    .map(o => (
                      <button
                        key={o.value}
                        type="button"
                        role="option"
                        aria-selected={draft === o.value}
                        className={`${styles.ddItem} ${draft === o.value ? styles.ddItemOn : ''}`}
                        onClick={() => { setDdOpen(false); commit(s, o.value) }}
                      >
                        {o.label}
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>
          {footer}
        </div>
      )
    }

    if (type === 'radio' || type === 'multiselect') {
      const opts = getOptions(s.q!, phases[s.phase].responses, L)
      const multi = type === 'multiselect'
      const searchable = opts.length > 9
      const shown = searchable && filter
        ? opts.filter(o => o.label.toLowerCase().includes(filter.toLowerCase()))
        : opts
      const sel: string[] = multi ? (Array.isArray(draft) ? draft : []) : []
      const plain = s.q!.id === 'annual_revenue' || s.q!.id === 'budget_range'
      const qNum = STEPS.filter((x, i) => x.phase === s.phase && !isSkipped(x, phases) && i <= STEPS.indexOf(s)).length
      const qTotal = STEPS.filter(x => x.phase === s.phase && !isSkipped(x, phases)).length
      return (
        <div className={styles.composer}>
          <div className={styles.cardHead}>
            <span className={styles.chip}>
              {c.phase} {PHASE_ORDER.indexOf(s.phase) + 1} · {qNum}/{qTotal}
            </span>
            <span className={styles.hint}>{multi ? c.pickMany : c.pickOne}</span>
            {isEdit && <span className={styles.editTag}>{c.editing}</span>}
          </div>
          {searchable && (
            <input
              className={styles.filterInput}
              placeholder={c.filter}
              value={filter}
              onChange={e => setFilter(e.target.value)}
              ref={el => { inputRef.current = el }}
            />
          )}
          <div className={styles.options} role={multi ? 'group' : 'radiogroup'}>
            {shown.map(o => {
              const on = multi ? sel.includes(o.value) : draft === o.value
              const num = opts.indexOf(o) + 1
              const { title, desc } = splitLabel(o.label, plain)
              return (
                <button
                  key={o.value}
                  type="button"
                  role={multi ? 'checkbox' : 'radio'}
                  aria-checked={on}
                  className={`${styles.option} ${on ? styles.optionOn : ''}`}
                  onClick={() => {
                    if (multi) {
                      setDraft((d: any) => {
                        const cur: string[] = Array.isArray(d) ? d : []
                        return cur.includes(o.value) ? cur.filter(v => v !== o.value) : [...cur, o.value]
                      })
                      setError('')
                    } else {
                      commit(s, o.value)
                    }
                  }}
                >
                  <span className={`${styles.num} ${multi ? styles.numBox : ''}`}>
                    {multi && on ? '✓' : (num <= 9 ? num : '')}
                  </span>
                  <span className={styles.optText}>
                    <span className={styles.optTitle}>{title}</span>
                    {desc && <span className={styles.optDesc}>{desc}</span>}
                  </span>
                </button>
              )
            })}
          </div>
          {multi ? (
            <div className={styles.composerFoot}>
              {error && <span className={styles.err} role="alert">{error}</span>}
              {!error && sel.length > 0 && (
                <span className={styles.hint}>{c.selectedCount(sel.length)}</span>
              )}
              <span className={styles.spacer} />
              {isEdit && (
                <button type="button" className={styles.ghost} onClick={() => setEditKey(null)}>{c.cancel}</button>
              )}
              {optional && !isEdit && (
                <button type="button" className={styles.ghost} onClick={() => commit(s, [], true)}>{c.skip}</button>
              )}
              <button type="button" className={styles.primary} onClick={() => commit(s, sel)}>
                {isEdit ? c.saveEdit : c.next}
              </button>
            </div>
          ) : footer}
        </div>
      )
    }

    const multiline = type === 'textarea'
    const max = s.kind === 'question' ? s.q!.validation?.maxLength : undefined
    const placeholder = s.kind === 'company' ? c.companyPh
      : s.kind === 'website' ? c.websitePh
      : ((L === 'id' ? ID_QUESTION_COPY[s.q!.id]?.placeholder : undefined) ?? s.q!.placeholder ?? c.typeHere)
    const send = () => commit(s, type === 'number' ? (draft === '' ? '' : Number(draft)) : draft)

    const hasContent = String(draft).trim() !== ''
    // AI-console style composer: borderless field on top, action row below
    // (secondary actions left, round arrow send button right).
    return (
      <div className={styles.composer}>
        {isEdit && <div className={styles.editTag}>{c.editing}</div>}
        {multiline ? (
          <textarea
            ref={el => { inputRef.current = el }}
            className={styles.consoleField}
            rows={1}
            placeholder={placeholder}
            value={draft}
            onChange={e => { setDraft(e.target.value); setError('') }}
            onInput={e => {
              const el = e.currentTarget
              el.style.height = 'auto'
              el.style.height = `${Math.min(el.scrollHeight, 140)}px`
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
            }}
          />
        ) : (
          <input
            ref={el => { inputRef.current = el }}
            className={styles.consoleField}
            type={type === 'number' ? 'number' : 'text'}
            inputMode={s.kind === 'website' ? 'url' : undefined}
            min={s.kind === 'question' ? s.q!.validation?.min : undefined}
            max={s.kind === 'question' ? s.q!.validation?.max : undefined}
            placeholder={placeholder}
            value={draft}
            onChange={e => { setDraft(e.target.value); setError('') }}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); send() } }}
          />
        )}
        <div className={styles.consoleRow}>
          <div className={styles.consoleLeft}>
            {isEdit && (
              <button type="button" className={styles.ghost} onClick={() => setEditKey(null)}>{c.cancel}</button>
            )}
            {optional && !isEdit && (
              <button type="button" className={styles.ghost} onClick={() => commit(s, '', true)}>{c.skip}</button>
            )}
            {error && <span className={styles.err} role="alert">{error}</span>}
            {!error && multiline && max && (
              <span className={styles.counterInline}>{String(draft).length}/{max}</span>
            )}
          </div>
          <button
            type="button"
            className={`${styles.sendBtn} ${hasContent ? styles.sendBtnOn : ''}`}
            onClick={send}
            aria-label={isEdit ? c.saveEdit : c.send}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </button>
        </div>
      </div>
    )
  }

  // ── side panel ──
  const facts = FACT_KEYS
    .map(k => {
      const st = STEPS.find(x => x.key === k)
      if (!st) return null
      const v = getValue(st)
      if (isEmpty(v)) return null
      let text = display(st)
      if (k === 'primary_objective' && text.length > 80) text = text.slice(0, 77) + '…'
      return { k, label: c.facts[k] ?? k, text }
    })
    .filter(Boolean) as { k: string; label: string; text: string }[]

  const panel = (
    <>
      <div className={styles.panelHead}>
        <span>{c.captured}</span>
        <button type="button" className={styles.sheetClose} onClick={() => setSheetOpen(false)}>{c.close}</button>
      </div>
      <div className={styles.facts}>
        {(companyName || websiteUrl) && (
          <div className={styles.company}>
            <div className={styles.companyName}>{companyName || '—'}</div>
            {websiteUrl && <div className={styles.companySite}>{websiteUrl}</div>}
          </div>
        )}
        {facts.length === 0 && !companyName && <p className={styles.muted}>{c.nothing}</p>}
        {facts.map(f => (
          <div key={f.k} className={styles.fact}>
            <span className={styles.factLabel}>{f.label}</span>
            <span className={styles.factValue}>{f.text}</span>
          </div>
        ))}
      </div>
      <div className={styles.progressBlock}>
        <div className={styles.panelHead}><span>{c.progress}</span><span>{pct}%</span></div>
        {phaseStats.map((p, i) => {
          const title = (L === 'id' ? ID_PHASE_COPY[p.id]?.title : undefined) ??
            DEEP_DIAGNOSTIC_PHASES.find(x => x.id === p.id)!.title
          const w = p.total ? Math.round((p.answered / p.total) * 100) : 0
          return (
            <div key={p.id} className={styles.phaseRow}>
              <div className={styles.phaseRowTop}>
                <span>{i + 1}. {title}</span>
                <span className={styles.muted}>{p.answered}/{p.total}</span>
              </div>
              <div className={styles.bar}><div className={styles.barFill} style={{ width: `${w}%` }} /></div>
            </div>
          )
        })}
      </div>
    </>
  )

  if (!ready) return <div className={styles.loading}><div className={styles.spinner} /></div>

  // ── transcript ──
  const history = STEPS.map((s, i) => ({ s, i })).filter(({ s, i }) => i < cursor && !isSkipped(s, phases))
  const showCurrent = !!current && !editKey

  // Echo a few captured answers back, e.g. "Country: Indonesia · Industry: Retail."
  const highlights = (only?: PhaseId): string => {
    const parts = FACT_KEYS
      .map(k => {
        const st = STEPS.find(x => x.key === k)
        if (!st || (only && st.phase !== only)) return null
        if (k === 'primary_objective' || isEmpty(getValue(st))) return null
        return `${c.facts[k] ?? k}: ${display(st)}`
      })
      .filter(Boolean)
    return parts.length ? parts.join(' · ') + '.' : ''
  }

  const phaseDivider = (phase: PhaseId, prevPhase: PhaseId | null) => {
    const n = PHASE_ORDER.indexOf(phase) + 1
    const cfg = DEEP_DIAGNOSTIC_PHASES.find(p => p.id === phase)!
    const title = (L === 'id' ? ID_PHASE_COPY[phase]?.title : undefined) ?? cfg.title
    const desc = (L === 'id' ? ID_PHASE_COPY[phase]?.description : undefined) ?? cfg.description
    const prev = prevPhase ? phaseStats.find(p => p.id === prevPhase) : null
    if (prev && prevPhase) {
      // Summary card: muted recap of what was just captured, then the lead line in white.
      const hl = highlights(prevPhase)
      return (
        <div className={styles.botRow} key={`div-${phase}`}>
          <div className={styles.summaryCard}>
            <p className={styles.summaryMuted}>
              {c.phaseDone(PHASE_ORDER.indexOf(prevPhase) + 1, prev.answered, prev.total)}
              {hl ? ` ${hl}` : ''}
            </p>
            <p className={styles.summaryLead}>{c.phase} {n} · {title} — {desc}</p>
          </div>
        </div>
      )
    }
    return (
      <div className={styles.divider} key={`div-${phase}`}>
        <div className={styles.dividerTitle}>{c.phase} {n} · {title}</div>
        <div className={styles.dividerDesc}>{desc}</div>
      </div>
    )
  }

  const rows: React.ReactNode[] = []
  let lastPhase: PhaseId | null = null
  const pushPhaseIfNew = (phase: PhaseId) => {
    if (phase !== lastPhase) {
      rows.push(phaseDivider(phase, lastPhase))
      lastPhase = phase
    }
  }

  rows.push(<div key="hello" className={styles.botRow}><div className={styles.bot}>{c.hello}</div></div>)

  history.forEach(({ s }) => {
    pushPhaseIfNew(s.phase)
    const a = ack(s)
    const helper = stepHelper(s)
    rows.push(
      <div key={`q-${s.key}`} className={styles.botRow}>
        <div className={styles.bot}>
          {stepPrompt(s)}
          {helper && <div className={styles.helper}>{helper}</div>}
        </div>
      </div>
    )
    rows.push(
      <div key={`a-${s.key}`} className={styles.userRow}>
        <button
          type="button"
          className={`${styles.user} ${editKey === s.key ? styles.userEditing : ''}`}
          title={c.edit}
          onClick={() => setEditKey(s.key)}
        >
          {display(s)}
          <span className={styles.editHint}>{c.edit}</span>
        </button>
      </div>
    )
    if (a) rows.push(<div key={`k-${s.key}`} className={styles.botRow}><div className={`${styles.bot} ${styles.botSoft}`}>{a}</div></div>)
  })

  if (showCurrent && current) {
    pushPhaseIfNew(current.phase)
    if (saved && cursor === 0) {
      rows.push(
        <div key="resume" className={styles.botRow}>
          <div className={styles.bot}>
            {c.resumeAsk}
            <div className={styles.inlineActions}>
              <button type="button" className={styles.primary} onClick={handleResume}>{c.resume}</button>
              <button type="button" className={styles.ghost} onClick={handleFresh}>{c.fresh}</button>
            </div>
          </div>
        </div>
      )
    }
    if (typing) {
      rows.push(
        <div key="typing" className={styles.botRow}>
          <div className={`${styles.bot} ${styles.typing}`} aria-label="…"><i /><i /><i /></div>
        </div>
      )
    } else {
      const helper = stepHelper(current)
      rows.push(
        <div key={`cur-${current.key}`} className={styles.botRow}>
          <div className={styles.bot}>
            {stepPrompt(current)}
            {helper && <div className={styles.helper}>{helper}</div>}
          </div>
        </div>
      )
    }
  }

  if (!current && !editKey) {
    rows.push(
      <div key="done" className={styles.botRow}>
        <div className={styles.summaryCard}>
          <p className={styles.summaryMuted}>
            {c.doneSummary(answeredVisible, totalVisible)}
            {highlights() ? ` ${highlights()}` : ''}
          </p>
          <p className={styles.summaryLead}>{c.done}</p>
          <div className={styles.inlineActions}>
            <button type="button" className={styles.primary} onClick={finish}>{c.finish}</button>
          </div>
        </div>
      </div>
    )
  }

  const composerVisible = !!activeStep && (editKey || (showCurrent && !typing))

  return (
    <div className={`${styles.page} font-manrope`}>
      <header className={styles.top}>
        <div className={styles.topTitle}>{c.title}</div>
        <div className={styles.stepper} aria-label={c.progress}>
          {PHASE_ORDER.map((id, i) => {
            const st = phaseStats[i]
            const done = st.total > 0 && st.answered === st.total
            const active = !!current && current.phase === id
            return (
              <span key={id} className={`${styles.dot} ${done ? styles.dotDone : ''} ${active ? styles.dotActive : ''}`}>
                {i + 1}
              </span>
            )
          })}
        </div>
        <div className={styles.topRight}>
          <button type="button" className={styles.summaryBtn} onClick={() => setSheetOpen(true)}>{c.summary}</button>
          <select
            className={styles.lang}
            aria-label={c.langLabel}
            value={locale}
            onChange={e => setLocale(e.target.value as Locale)}
          >
            <option value="en">EN</option>
            <option value="id">ID</option>
          </select>
        </div>
      </header>

      <div className={styles.body}>
        <section className={styles.chat}>
          <div className={styles.scroll}>
            <div className={styles.thread}>
              {rows}
              <div ref={endRef} />
            </div>
          </div>
          {composerVisible && <div className={styles.composerWrap}>{renderComposer()}</div>}
        </section>

        <aside className={`${styles.panel} ${sheetOpen ? styles.panelOpen : ''}`}>{panel}</aside>
      </div>
    </div>
  )
}
