'use client'

/**
 * Free Business Operations Analysis in the Deep Diagnostic chat UI.
 *
 * Same look as components/diagnostics/chat/ChatDiagnostic (it imports that
 * stylesheet): bubble-less, monochrome, phase header, "What we captured" side
 * panel, input at the bottom. Content and scoring are the landing page's free
 * analysis (lib/freeAnalysis): a company profile, then twelve operational
 * questions. Scripted, no LLM. Finishing posts the answers to
 * /api/diagnostics/free, which scores and stores the run for the account.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { asset } from '@/lib/asset'
import { useLocaleContext } from '@/hooks/useLocale'
import { requestUpgrade } from '@/lib/planAccess'
import { getAssessmentCopy } from '@/lib/freeAnalysis/copy'
import { INDUSTRY_VALUES, QUESTION_SPEC, SIZE_VALUES } from '@/lib/freeAnalysis/scoring'
import {
  fetchFreeAnalysisStatus, loadProgress, saveProgress, submitFreeAnalysis,
  type FreeAnalysisProgress, type FreeAnalysisStatus,
} from '@/lib/freeAnalysis/client'
import styles from '@/components/diagnostics/chat/ChatDiagnostic.module.css'

type Locale = 'en' | 'id'
type PhaseId = 'profile' | 'baseline' | 'friction' | 'capacity'

const PHASES: PhaseId[] = ['profile', 'baseline', 'friction', 'capacity']

interface Step {
  key: string
  kind: 'company' | 'industry' | 'size' | 'question'
  phase: PhaseId
}

/**
 * The landing page grouped the twelve questions as baseline (1-4), friction
 * (5-8) and capacity to change (9-12). The chat shows that grouping as phases.
 */
const STEPS: Step[] = [
  { key: 'companyName', kind: 'company', phase: 'profile' },
  { key: 'industry', kind: 'industry', phase: 'profile' },
  { key: 'companySize', kind: 'size', phase: 'profile' },
  ...QUESTION_SPEC.map<Step>((q, i) => ({
    key: q.id, kind: 'question', phase: i < 4 ? 'baseline' : i < 8 ? 'friction' : 'capacity',
  })),
]

const COPY = {
  en: {
    title: 'Free Analysis',
    hello: 'Welcome to the free Business Operations Analysis, powered by Aivory Aether. Three questions about your company, then twelve about how work runs today. It takes about three minutes and you get your score, maturity band and the dimensions holding you back',
    askCompany: "Let's start with your company. What is its name?",
    askIndustry: 'Which industry are you in?',
    askSize: 'How many people work at the company?',
    companyPh: 'e.g. PT Maju Bersama',
    send: 'Send',
    filter: 'Search…',
    phase: 'Phase',
    captured: 'What we captured',
    nothing: 'Your answers will appear here as we go',
    progress: 'Progress',
    summary: 'Summary',
    close: 'Close',
    resumeAsk: 'You have an analysis in progress. Pick up where you left off?',
    resume: 'Resume',
    fresh: 'Start fresh',
    edit: 'Tap to edit',
    pickOne: 'Pick one · press 1–9',
    editing: 'Editing this answer',
    cancel: 'Cancel',
    companyReq: 'Enter at least 2 characters',
    ackCompany: (n: string) => `Nice to meet ${n}`,
    phaseDone: (n: number) => `Phase ${n} done`,
    done: "That's everything. Your results are ready",
    finish: 'See my results',
    saving: 'Scoring your answers…',
    saveFailed: 'We could not save your analysis just now. Try again in a moment',
    retry: 'Try again',
    limitTitle: (n: number) => `You have used both free analyses on this account (${n} of ${n})`,
    limitBody: 'Your latest result is still here. The paid Business Operations Analysis goes deeper: what fixing each gap is worth, which to start with, and where AI can carry the load',
    viewLatest: 'View my result',
    upgrade: 'See paid plans',
    runsLeft: (n: number) => (n === 1 ? '1 free analysis left' : `${n} free analyses left`),
    facts: { industry: 'Industry', companySize: 'Size' } as Record<string, string>,
    phases: {
      profile: { title: 'Company profile', desc: 'Who you are, so the analysis fits your context' },
      baseline: { title: 'Baseline', desc: 'How work is captured, standardised and recorded today' },
      friction: { title: 'Friction', desc: 'Where time is lost to manual work, rework, handoffs and waiting' },
      capacity: { title: 'Capacity to change', desc: 'Ownership, mandate, readiness and the people to carry it out' },
    } as Record<PhaseId, { title: string; desc: string }>,
  },
  id: {
    title: 'Analisis Gratis',
    hello: 'Selamat datang di Analisis Operasional Bisnis gratis, powered by Aivory Aether. Tiga pertanyaan tentang perusahaan Anda, lalu dua belas tentang cara kerja berjalan saat ini. Butuh sekitar tiga menit, dan Anda akan mendapat skor, tingkat kematangan, serta dimensi yang menahan Anda',
    askCompany: 'Mari mulai dari perusahaan Anda. Apa namanya?',
    askIndustry: 'Perusahaan Anda bergerak di industri apa?',
    askSize: 'Berapa banyak orang yang bekerja di perusahaan?',
    companyPh: 'mis. PT Maju Bersama',
    send: 'Kirim',
    filter: 'Cari…',
    phase: 'Fase',
    captured: 'Yang kami tangkap',
    nothing: 'Jawaban Anda akan muncul di sini',
    progress: 'Progres',
    summary: 'Ringkasan',
    close: 'Tutup',
    resumeAsk: 'Anda punya analisis yang belum selesai. Lanjutkan dari terakhir?',
    resume: 'Lanjutkan',
    fresh: 'Mulai baru',
    edit: 'Ketuk untuk ubah',
    pickOne: 'Pilih satu · tekan 1–9',
    editing: 'Mengubah jawaban ini',
    cancel: 'Batal',
    companyReq: 'Isi minimal 2 karakter',
    ackCompany: (n: string) => `Senang berkenalan dengan ${n}`,
    phaseDone: (n: number) => `Fase ${n} selesai`,
    done: 'Itu semuanya. Hasil Anda sudah siap',
    finish: 'Lihat hasil saya',
    saving: 'Menghitung jawaban Anda…',
    saveFailed: 'Analisis Anda belum bisa disimpan. Coba lagi sebentar lagi',
    retry: 'Coba lagi',
    limitTitle: (n: number) => `Anda sudah memakai kedua analisis gratis di akun ini (${n} dari ${n})`,
    limitBody: 'Hasil terakhir Anda tetap tersimpan. Business Operations Analysis berbayar lebih dalam: berapa nilai memperbaiki setiap celah, mana yang dimulai lebih dulu, dan di mana AI bisa mengambil beban',
    viewLatest: 'Lihat hasil saya',
    upgrade: 'Lihat paket berbayar',
    runsLeft: (n: number) => `Sisa ${n} analisis gratis`,
    facts: { industry: 'Industri', companySize: 'Ukuran' } as Record<string, string>,
    phases: {
      profile: { title: 'Profil perusahaan', desc: 'Siapa Anda, agar analisis sesuai konteks Anda' },
      baseline: { title: 'Kondisi dasar', desc: 'Bagaimana pekerjaan dicatat, distandarkan, dan disimpan saat ini' },
      friction: { title: 'Hambatan', desc: 'Di mana waktu hilang karena kerja manual, pengulangan, serah terima, dan menunggu' },
      capacity: { title: 'Kapasitas berubah', desc: 'Kepemilikan, mandat, kesiapan, dan orang yang menjalankannya' },
    } as Record<PhaseId, { title: string; desc: string }>,
  },
}

const empty = (): FreeAnalysisProgress => ({ companyName: '', industry: '', companySize: '', answers: {} })

function valueOf(s: Step, p: FreeAnalysisProgress): string | number | undefined {
  if (s.kind === 'company') return p.companyName || undefined
  if (s.kind === 'industry') return p.industry || undefined
  if (s.kind === 'size') return p.companySize || undefined
  return p.answers[s.key]
}

function firstMissing(p: FreeAnalysisProgress): number {
  const i = STEPS.findIndex(s => valueOf(s, p) === undefined)
  return i === -1 ? STEPS.length : i
}

interface Opt { value: string | number; label: string }

export default function FreeAnalysisChat() {
  const router = useRouter()
  const { locale, setLocale } = useLocaleContext()
  const L = (locale === 'id' ? 'id' : 'en') as Locale
  const c = COPY[L]
  const a = getAssessmentCopy(L)

  const [ready, setReady] = useState(false)
  const [data, setData] = useState<FreeAnalysisProgress>(empty)
  const [cursor, setCursor] = useState(0)
  const [editKey, setEditKey] = useState<string | null>(null)
  const [saved, setSaved] = useState<FreeAnalysisProgress | null>(null)
  const [status, setStatus] = useState<FreeAnalysisStatus | null>(null)
  const [draft, setDraft] = useState('')
  const [filter, setFilter] = useState('')
  const [error, setError] = useState('')
  const [typing, setTyping] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [submit, setSubmit] = useState<'idle' | 'saving' | 'failed' | 'limit'>('idle')
  const [helloStreaming, setHelloStreaming] = useState(true)
  const [helloCount, setHelloCount] = useState(0)
  const endRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const firstSave = useRef(true)

  // ── mount: saved progress behind a Resume choice, run count from the server ──
  useEffect(() => {
    const p = loadProgress()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (p && firstMissing(p) > 0) setSaved(p)
    setReady(true)
    let cancelled = false
    fetchFreeAnalysisStatus().then(s => { if (!cancelled && s) setStatus(s) })
    return () => { cancelled = true }
  }, [])

  const limitReached = status !== null && status.remaining <= 0

  // ── autosave per user ──
  useEffect(() => {
    if (firstSave.current) { firstSave.current = false; return }
    const t = setTimeout(() => saveProgress(data), 400)
    return () => clearTimeout(t)
  }, [data])

  const current: Step | undefined = STEPS[cursor]
  const activeStep: Step | undefined = editKey ? STEPS.find(s => s.key === editKey) : current
  const activeKey = activeStep?.key

  // ── welcome streams in word by word, a click completes it ──
  useEffect(() => {
    if (!ready || !helloStreaming) return
    const words = c.hello.split(' ').length
    const id = setInterval(() => {
      setHelloCount(n => {
        if (n + 1 >= words) { clearInterval(id); setHelloStreaming(false); return words }
        return n + 1
      })
    }, 38)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, helloStreaming])

  useEffect(() => {
    if (!ready || helloStreaming) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTyping(true)
    const t = setTimeout(() => setTyping(false), cursor === 0 ? 350 : 500)
    return () => clearTimeout(t)
  }, [cursor, ready, helloStreaming])

  useEffect(() => {
    if (!activeStep) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(activeStep.kind === 'company' ? data.companyName : '')
    setFilter('')
    setError('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    const t = setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 120)
    return () => clearTimeout(t)
  }, [cursor, typing, editKey, saved, submit, helloStreaming])

  useEffect(() => {
    if (!typing) inputRef.current?.focus({ preventScroll: true })
  }, [typing, activeKey])

  // ── options and display ──
  const optionsFor = useCallback((s: Step): Opt[] => {
    if (s.kind === 'industry') return INDUSTRY_VALUES.map(v => ({ value: v, label: a.industries[v] }))
    if (s.kind === 'size') return SIZE_VALUES.map(v => ({ value: v, label: a.sizes[v] }))
    if (s.kind === 'question') return a.questions[s.key].options.map((label, i) => ({ value: i, label }))
    return []
  }, [a])

  const display = (s: Step): string => {
    const v = valueOf(s, data)
    if (v === undefined) return ''
    if (s.kind === 'company') return String(v)
    return optionsFor(s).find(o => o.value === v)?.label ?? String(v)
  }

  const prompt = (s: Step): string =>
    s.kind === 'company' ? c.askCompany
      : s.kind === 'industry' ? c.askIndustry
        : s.kind === 'size' ? c.askSize
          : a.questions[s.key].question

  // ── commit ──
  const commit = (s: Step, value: string | number) => {
    if (s.kind === 'company') {
      const name = String(value).trim()
      if (name.length < 2) { setError(c.companyReq); return }
      value = name.slice(0, 120)
    }
    setError('')
    const next: FreeAnalysisProgress = s.kind === 'question'
      ? { ...data, answers: { ...data.answers, [s.key]: Number(value) } }
      : { ...data, [s.key]: String(value) }
    setData(next)
    if (editKey) { setEditKey(null); return }
    setCursor(firstMissing(next))
  }

  // ── keyboard: 1–9 picks the numbered option ──
  const isChoice = !!activeStep && activeStep.kind !== 'company'
  useEffect(() => {
    if (!isChoice || !activeStep || typing || helloStreaming) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const n = Number(e.key)
      if (!Number.isInteger(n) || n < 1 || n > 9) return
      const o = optionsFor(activeStep)[n - 1]
      if (!o) return
      e.preventDefault()
      commit(activeStep, o.value)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isChoice, activeKey, typing, helloStreaming, data, editKey, L])

  const handleResume = () => {
    if (!saved) return
    setData(saved)
    setCursor(firstMissing(saved))
    setSaved(null)
  }

  const handleFresh = () => {
    saveProgress(null)
    setData(empty())
    setCursor(0)
    setEditKey(null)
    setSaved(null)
  }

  const finish = async () => {
    setSubmit('saving')
    const out = await submitFreeAnalysis({ ...data })
    if (out.kind === 'saved') {
      router.push('/diagnostics/free/result')
      return
    }
    if (out.kind === 'limit') { setStatus(out.status); setSubmit('limit'); return }
    setSubmit('failed')
  }

  // ── derived progress ──
  const phaseStats = useMemo(() => PHASES.map(id => {
    const idxs = STEPS.map((s, i) => ({ s, i })).filter(x => x.s.phase === id)
    return { id, total: idxs.length, answered: idxs.filter(x => valueOf(x.s, data) !== undefined).length }
  }), [data])
  const answeredAll = phaseStats.reduce((n, p) => n + p.answered, 0)
  const pct = Math.round((answeredAll / STEPS.length) * 100)

  // ── composer ──
  const renderComposer = () => {
    if (!activeStep) return null
    const s = activeStep
    const isEdit = !!editKey

    if (s.kind === 'company') {
      const hasContent = draft.trim() !== ''
      return (
        <div className={`${styles.composer} ${styles.composerInline}`}>
          {isEdit && <div className={styles.editTag}>{c.editing}</div>}
          <input
            ref={inputRef}
            className={styles.consoleField}
            type="text"
            maxLength={120}
            placeholder={c.companyPh}
            value={draft}
            onChange={e => { setDraft(e.target.value); setError('') }}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(s, draft) } }}
          />
          <div className={styles.consoleRow}>
            <div className={styles.consoleLeft}>
              {isEdit && <button type="button" className={styles.ghost} onClick={() => setEditKey(null)}>{c.cancel}</button>}
              {error && <span className={styles.err} role="alert">{error}</span>}
            </div>
            <button
              type="button"
              className={`${styles.sendBtn} ${hasContent ? styles.sendBtnOn : ''}`}
              onClick={() => commit(s, draft)}
              aria-label={c.send}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 4v7a4 4 0 0 1-4 4H4" />
                <path d="m9 10-5 5 5 5" />
              </svg>
            </button>
          </div>
        </div>
      )
    }

    const opts = optionsFor(s)
    const searchable = opts.length > 9
    const shown = searchable && filter ? opts.filter(o => o.label.toLowerCase().includes(filter.toLowerCase())) : opts
    const selected = valueOf(s, data)
    const inPhase = STEPS.filter(x => x.phase === s.phase)
    const qNum = inPhase.indexOf(s) + 1
    return (
      <div className={styles.composer}>
        <div className={styles.cardHead}>
          <span className={styles.chip}>{c.phase} {PHASES.indexOf(s.phase) + 1} · {qNum}/{inPhase.length}</span>
          <span className={styles.hint}>{c.pickOne}</span>
          {isEdit && <span className={styles.editTag}>{c.editing}</span>}
        </div>
        {searchable && (
          <input
            ref={inputRef}
            className={styles.filterInput}
            placeholder={c.filter}
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
        )}
        <div className={styles.options} role="radiogroup">
          {shown.map(o => {
            const on = selected === o.value
            const num = opts.indexOf(o) + 1
            return (
              <button
                key={String(o.value)}
                type="button"
                role="radio"
                aria-checked={on}
                className={`${styles.option} ${on ? styles.optionOn : ''}`}
                onClick={() => commit(s, o.value)}
              >
                <span className={styles.num}>{num <= 9 ? num : ''}</span>
                <span className={styles.optText}><span className={styles.optTitle}>{o.label}</span></span>
              </button>
            )
          })}
        </div>
        {isEdit && (
          <div className={styles.composerFoot}>
            <span className={styles.spacer} />
            <button type="button" className={styles.ghost} onClick={() => setEditKey(null)}>{c.cancel}</button>
          </div>
        )}
      </div>
    )
  }

  // ── side panel ──
  const panel = (
    <>
      <div className={styles.panelHead}>
        <span>{c.captured}</span>
        <button type="button" className={styles.sheetClose} onClick={() => setSheetOpen(false)}>{c.close}</button>
      </div>
      <div className={styles.facts}>
        {data.companyName && (
          <div className={styles.company}><div className={styles.companyName}>{data.companyName}</div></div>
        )}
        {!data.companyName && <p className={styles.muted}>{c.nothing}</p>}
        {(['industry', 'companySize'] as const).map(k => {
          const st = STEPS.find(x => x.key === k)!
          const text = display(st)
          return text ? (
            <div key={k} className={styles.fact}>
              <span className={styles.factLabel}>{c.facts[k]}</span>
              <span className={styles.factValue}>{text}</span>
            </div>
          ) : null
        })}
        {status && status.remaining > 0 && <p className={styles.muted}>{c.runsLeft(status.remaining)}</p>}
      </div>
      <div className={styles.progressBlock}>
        <div className={styles.panelHead}><span>{c.progress}</span><span>{pct}%</span></div>
        {phaseStats.map((p, i) => (
          <div key={p.id} className={styles.phaseRow}>
            <div className={styles.phaseRowTop}>
              <span>{i + 1}. {c.phases[p.id].title}</span>
              <span className={styles.muted}>{p.answered}/{p.total}</span>
            </div>
            <div className={styles.bar}><div className={styles.barFill} style={{ width: `${Math.round((p.answered / p.total) * 100)}%` }} /></div>
          </div>
        ))}
      </div>
    </>
  )

  if (!ready) return <div className={styles.loading}><div className={styles.spinner} /></div>

  // ── transcript ──
  const rows: React.ReactNode[] = []
  const helloWords = c.hello.split(' ')
  rows.push(
    <div key="hello" className={styles.botRow}>
      <div className={styles.bot} onClick={() => { if (helloStreaming) { setHelloCount(helloWords.length); setHelloStreaming(false) } }}>
        {helloStreaming ? helloWords.slice(0, helloCount).join(' ') : c.hello}
        {helloStreaming && <span className={styles.streamCaret} aria-hidden="true" />}
      </div>
    </div>
  )

  let lastPhase: PhaseId | null = null
  const pushPhase = (phase: PhaseId) => {
    if (phase === lastPhase) return
    const n = PHASES.indexOf(phase) + 1
    const info = c.phases[phase]
    if (lastPhase) {
      rows.push(
        <div className={styles.botRow} key={`div-${phase}`}>
          <div className={styles.summaryCard}>
            <p className={styles.summaryMuted}>{c.phaseDone(PHASES.indexOf(lastPhase) + 1)}</p>
            <p className={styles.summaryLead}>{c.phase} {n} · {info.title}: {info.desc}</p>
          </div>
        </div>
      )
    } else {
      rows.push(
        <div className={styles.divider} key={`div-${phase}`}>
          <div className={styles.dividerTitle}>{c.phase} {n} · {info.title}</div>
          <div className={styles.dividerDesc}>{info.desc}</div>
        </div>
      )
    }
    lastPhase = phase
  }

  STEPS.forEach((s, i) => {
    if (i >= cursor) return
    pushPhase(s.phase)
    rows.push(<div key={`q-${s.key}`} className={styles.botRow}><div className={styles.bot}>{prompt(s)}</div></div>)
    rows.push(
      <div key={`a-${s.key}`} className={styles.userRow}>
        <button
          type="button"
          className={`${styles.user} ${editKey === s.key ? styles.userEditing : ''}`}
          title={c.edit}
          disabled={submit === 'saving'}
          onClick={() => setEditKey(s.key)}
        >
          {display(s)}
          <span className={styles.editHint}>{c.edit}</span>
        </button>
      </div>
    )
    if (s.kind === 'company' && data.companyName) {
      rows.push(<div key="ack-company" className={styles.botRow}><div className={`${styles.bot} ${styles.botSoft}`}>{c.ackCompany(data.companyName)}</div></div>)
    }
  })

  const showCurrent = !!current && !editKey && !limitReached
  if (showCurrent && current) {
    pushPhase(current.phase)
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
    rows.push(typing
      ? <div key="typing" className={styles.botRow}><div className={`${styles.bot} ${styles.typing}`} aria-label="…"><i /><i /><i /></div></div>
      : <div key={`cur-${current.key}`} className={styles.botRow}><div className={styles.bot}>{prompt(current)}</div></div>)
  }

  if (limitReached && submit !== 'saving') {
    rows.push(
      <div key="limit" className={styles.botRow}>
        <div className={styles.summaryCard}>
          <p className={styles.summaryLead}>{c.limitTitle(status!.limit)}</p>
          <p className={styles.summaryMuted}>{c.limitBody}</p>
          <div className={styles.inlineActions}>
            {status!.latest && <Link href="/diagnostics/free/result" className={styles.primary}>{c.viewLatest}</Link>}
            <button type="button" className={styles.ghost} onClick={() => requestUpgrade({ feature: 'the Business Operations Analysis' })}>{c.upgrade}</button>
          </div>
        </div>
      </div>
    )
  } else if (!current && !editKey) {
    rows.push(
      <div key="done" className={styles.botRow}>
        <div className={styles.summaryCard}>
          <p className={styles.summaryLead}>{submit === 'saving' ? c.saving : c.done}</p>
          {submit === 'failed' && <p className={styles.summaryMuted} role="alert">{c.saveFailed}</p>}
          <div className={styles.inlineActions}>
            <button type="button" className={styles.primary} disabled={submit === 'saving'} onClick={finish}>
              {submit === 'failed' ? c.retry : c.finish}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const composerVisible = !helloStreaming && !!activeStep && !limitReached && submit !== 'saving' && (!!editKey || (showCurrent && !typing))

  return (
    <div className={`${styles.page} font-manrope`}>
      <header className={styles.top}>
        <div className={styles.topTitle}>{c.title}</div>
        <div className={styles.stepper} aria-label={c.progress}>
          {PHASES.map((id, i) => {
            const st = phaseStats[i]
            const done = st.answered === st.total
            const active = !!current && current.phase === id
            return (
              <span key={id} className={`${styles.dot} ${done ? styles.dotDone : ''} ${active ? styles.dotActive : ''}`}>{i + 1}</span>
            )
          })}
        </div>
        <div className={styles.topRight}>
          <button type="button" className={styles.summaryBtn} onClick={() => setSheetOpen(true)}>{c.summary}</button>
          <select className={styles.lang} aria-label="Language" value={L} onChange={e => setLocale(e.target.value as Locale)}>
            <option value="en">EN</option>
            <option value="id">ID</option>
          </select>
        </div>
      </header>

      <div className={styles.body}>
        <section className={styles.chat}>
          <div className={styles.scroll}>
            <div className={styles.thread}>
              {helloStreaming ? rows.slice(0, 1) : rows}
              <div ref={endRef} className={styles.endAnchor} />
            </div>
          </div>
          {composerVisible && (
            <div className={styles.composerWrap}>
              {renderComposer()}
              <div className={styles.aetherRow}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={asset('/Aivory_Aether_white.svg')} alt="Aivory Aether" className={styles.aetherMark} />
              </div>
            </div>
          )}
        </section>
        <aside className={`${styles.panel} ${sheetOpen ? styles.panelOpen : ''}`}>{panel}</aside>
      </div>
    </div>
  )
}
