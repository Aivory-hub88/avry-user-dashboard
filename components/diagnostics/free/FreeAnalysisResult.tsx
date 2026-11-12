'use client'

/**
 * Free analysis result, styled like the paid report (cards, type scale,
 * ScoreRing) but showing only what the free analysis computes: score and
 * maturity band, the five-dimension profile with its driver questions,
 * strengths and blockers, insights, the quick note and narrative, and the
 * closing hook that names what only the paid analysis answers.
 *
 * The result comes from the server (GET /api/diagnostics/free) with a per-user
 * cache for an instant first paint. Everything shown is re-derived from the
 * stored answers with lib/freeAnalysis/scoring, so the wording follows the
 * selected language.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import ScoreRing from '@/components/result/ScoreRing'
import GrainHeader from '@/components/ui/GrainHeader'
import { asset } from '@/lib/asset'
import { useLocaleContext } from '@/hooks/useLocale'
import { requestUpgrade } from '@/lib/planAccess'
import { getAssessmentCopy } from '@/lib/freeAnalysis/copy'
import { MATURITY_STAGES, buildFreeAnalysisView, type StoredFreeAnalysis } from '@/lib/freeAnalysis/scoring'
import { cachedResult, fetchFreeAnalysisStatus, type FreeAnalysisStatus } from '@/lib/freeAnalysis/client'
import styles from './FreeAnalysisResult.module.css'

type Locale = 'en' | 'id'

const COPY = {
  en: {
    back: '← Diagnostics',
    eyebrow: 'Free analysis',
    company: 'Company',
    industry: 'Industry',
    size: 'Company size',
    health: 'Operational maturity',
    bandLabel: (m: string) => `${m} maturity`,
    profile: 'Operational profile',
    profileCaption: 'Each dimension is the mean of its questions on a 0–100 scale. The driver is the answer that most explains its position',
    driver: 'Driver',
    working: 'Working for you',
    holding: 'Holding you back',
    noStrengths: 'No dimension reaches the Developing band yet',
    noBlockers: 'No dimension is below the Defined band',
    insights: 'What the answers say',
    notes: 'Notes',
    notShown: 'What this analysis does not show',
    upgrade: 'See the Business Operations Analysis',
    pdf: 'Download PDF',
    pdfBusy: 'Preparing PDF…',
    again: 'Run the free analysis again',
    runsLeft: (n: number) => (n === 1 ? '1 free analysis left' : `${n} free analyses left`),
    noRuns: 'Both free analyses on this account are used',
    none: 'No free analysis on this account yet',
    start: 'Start the free analysis',
    completed: (d: string) => `Completed ${d}`,
  },
  id: {
    back: '← Diagnostik',
    eyebrow: 'Analisis gratis',
    company: 'Perusahaan',
    industry: 'Industri',
    size: 'Ukuran perusahaan',
    health: 'Kematangan operasional',
    bandLabel: (m: string) => `Kematangan ${m}`,
    profile: 'Profil operasional',
    profileCaption: 'Setiap dimensi adalah rata-rata pertanyaannya pada skala 0–100. Pendorongnya adalah jawaban yang paling menjelaskan posisinya',
    driver: 'Pendorong',
    working: 'Yang bekerja untuk Anda',
    holding: 'Yang menahan Anda',
    noStrengths: 'Belum ada dimensi yang mencapai tingkat Developing',
    noBlockers: 'Tidak ada dimensi di bawah tingkat Defined',
    insights: 'Apa kata jawaban Anda',
    notes: 'Catatan',
    notShown: 'Yang belum ditunjukkan analisis ini',
    upgrade: 'Lihat Business Operations Analysis',
    pdf: 'Unduh PDF',
    pdfBusy: 'Menyiapkan PDF…',
    again: 'Jalankan analisis gratis lagi',
    runsLeft: (n: number) => `Sisa ${n} analisis gratis`,
    noRuns: 'Kedua analisis gratis di akun ini sudah terpakai',
    none: 'Belum ada analisis gratis di akun ini',
    start: 'Mulai analisis gratis',
    completed: (d: string) => `Selesai ${d}`,
  },
}

/** On-screen copy never ends with a full stop; the landing page's inner punctuation stays. */
const noStop = (t: string) => t.replace(/\.\s*$/, '')

/** Bolds score fractions and day ranges inside the narrative, as the landing page did. */
function renderWithBold(text: string): ReactNode[] {
  const parts = text.split(/(\d+\/100|\d+(?:–\d+)?\s*(?:days|hari))/g)
  return parts.map((part, i) => (/^\d+\/100$|(days|hari)$/.test(part) ? <strong key={i}>{part}</strong> : <span key={i}>{part}</span>))
}

/** Stable report reference for a stored run (the landing page made one per visit). */
function diagnosticId(r: StoredFreeAnalysis): string {
  const t = Date.parse(r.completedAt) || 0
  return 'DIAG_' + t.toString(36).toUpperCase().slice(-8).padStart(8, '0')
}

export default function FreeAnalysisResult() {
  const { locale, setLocale } = useLocaleContext()
  const L = (locale === 'id' ? 'id' : 'en') as Locale
  const c = COPY[L]
  const a = getAssessmentCopy(L)

  const [result, setResult] = useState<StoredFreeAnalysis | null>(null)
  const [status, setStatus] = useState<FreeAnalysisStatus | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)

  useEffect(() => {
    const cached = cachedResult()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (cached) { setResult(cached); setLoaded(true) }
    let cancelled = false
    fetchFreeAnalysisStatus().then(s => {
      if (cancelled) return
      if (s) {
        setStatus(s)
        if (s.latest) setResult(s.latest)
      }
      setLoaded(true)
    })
    return () => { cancelled = true }
  }, [])

  const view = useMemo(() => (result ? buildFreeAnalysisView(result, L) : null), [result, L])

  const downloadPdf = async () => {
    if (!result || !view) return
    setPdfBusy(true)
    try {
      const { buildAssessmentPdf } = await import('@/lib/freeAnalysis/pdf')
      const pdf = await buildAssessmentPdf({
        companyName: result.companyName.trim() || 'Your company',
        industryLabel: view.industryLabel,
        sizeLabel: view.sizeLabel,
        score: view.score,
        maturity: view.maturity,
        quickNote: view.quickNote,
        profile: view.profile.map(d => ({
          label: d.label,
          score: d.score,
          driverLabel: (d.score >= 67 ? d.strongest : d.weakest).label,
          driverScore: (d.score >= 67 ? d.strongest : d.weakest).score,
        })),
        strengths: view.strengths.map(s => `${s.label} — ${s.score}/100`),
        blockers: view.blockers.map(b => `${b.label} — ${b.score}/100`),
        insights: view.insights,
        narrative: view.narrative,
        closingHook: view.closingHook,
        diagnosticId: diagnosticId(result),
        generatedAt: new Date(result.completedAt),
        upgradeUrl: `${window.location.origin}${asset('/subscriptions')}`,
        strings: a.pdf,
        labels: a.card,
        locale: L,
      })
      pdf.save(`${result.companyName.trim() || 'Company'}_Business_Operations_Assessment.pdf`)
    } catch (err) {
      console.error('Failed to generate the PDF report:', err)
    } finally {
      setPdfBusy(false)
    }
  }

  if (!loaded) return <div className={styles.loading}><div className={styles.spinner} /></div>

  const header = (
    <div className={styles.topRow}>
      <Link href="/diagnostics" className={styles.back}>{c.back}</Link>
      <div className={styles.topActions}>
        <select className={styles.lang} aria-label="Language" value={L} onChange={e => setLocale(e.target.value as Locale)}>
          <option value="en">EN</option>
          <option value="id">ID</option>
        </select>
      </div>
    </div>
  )

  if (!result || !view) {
    return (
      <div className={`${styles.page} font-manrope`}>
        <div className={styles.content}>
          {header}
          <section className={styles.card}>
            <span className={styles.eyebrow}>{c.eyebrow}</span>
            <h1 className={styles.title}>{c.none}</h1>
            <Link href="/diagnostics/free" className={styles.primary}>{c.start}</Link>
          </section>
        </div>
      </div>
    )
  }

  const stageIndex = MATURITY_STAGES.indexOf(view.maturity)
  const remaining = status?.remaining ?? null
  const completed = new Date(result.completedAt).toLocaleDateString(L === 'id' ? 'id-ID' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className={`${styles.page} font-manrope`}>
      <div className={styles.content}>
        {header}

        {/* Header: what this report is about */}
        {/* Same grainy-gradient world as the /diagnostics hero card */}
        <GrainHeader world="harbour" className={styles.hero}>
          <div className={styles.heroInner}>
            <span className={styles.heroEyebrow}>{c.eyebrow} · {c.completed(completed)}</span>
            <h1 className={styles.heroTitle}>{a.ui.resultsTitle}</h1>
            <div className={styles.meta}>
              <div><span className={styles.heroEyebrow}>{c.company}</span><div className={styles.heroMetaValue}>{result.companyName}</div></div>
              <div><span className={styles.heroEyebrow}>{c.industry}</span><div className={styles.heroMetaValue}>{view.industryLabel}</div></div>
              <div><span className={styles.heroEyebrow}>{c.size}</span><div className={styles.heroMetaValue}>{view.sizeLabel}</div></div>
            </div>
            <div className={styles.actions}>
              <button type="button" className={styles.heroPrimary} onClick={downloadPdf} disabled={pdfBusy}>{pdfBusy ? c.pdfBusy : c.pdf}</button>
              {remaining !== null && remaining > 0 && (
                <>
                  <Link href="/diagnostics/free" className={styles.heroGhost}>{c.again}</Link>
                  <span className={styles.heroNote}>{c.runsLeft(remaining)}</span>
                </>
              )}
              {remaining === 0 && <span className={styles.heroNote}>{c.noRuns}</span>}
            </div>
          </div>
        </GrainHeader>

        {/* Score and maturity band */}
        <section className={styles.card}>
          <h2 className={styles.sectionLabel}>{c.health}</h2>
          <div className={styles.scoreRow}>
            <div className={styles.ringCol}><ScoreRing score={view.score} maturityLevel={view.maturity} locale={L} /></div>
            <div>
              <p className={styles.band}>{c.bandLabel(view.maturity)}</p>
              <p className={styles.body}>{noStop(view.bandDescriptor)}</p>
              <div className={styles.ladder} aria-hidden="true">
                <div className={styles.ladderTrack}>
                  {MATURITY_STAGES.map((s, i) => <span key={s} className={`${styles.ladderStep} ${i <= stageIndex ? styles.ladderStepOn : ''}`} />)}
                </div>
                <div className={styles.ladderLabels}>
                  {MATURITY_STAGES.map((s, i) => <span key={s} className={`${styles.ladderLabel} ${i === stageIndex ? styles.ladderLabelOn : ''}`}>{s}</span>)}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Five-dimension profile */}
        <section className={styles.card}>
          <h2 className={styles.sectionLabel}>{a.card.operationalProfile}</h2>
          <div className={styles.dims}>
            {view.profile.map(d => {
              const driver = d.score >= 67 ? d.strongest : d.weakest
              return (
                <div key={d.key}>
                  <div className={styles.dimTop}>
                    <span className={styles.dimName}>{d.label}</span>
                    <span className={styles.dimScore}>{d.score}/100</span>
                  </div>
                  <div className={styles.dimBar}><div className={styles.dimFill} style={{ width: `${d.score}%` }} /></div>
                  <span className={styles.dimDriver}>{c.driver}: {driver.label} · {driver.score}/3</span>
                </div>
              )
            })}
          </div>
          <p className={styles.caption}>{c.profileCaption}</p>
        </section>

        {/* Strengths and blockers */}
        <section className={styles.card}>
          <div className={styles.twoCol}>
            <div>
              <span className={styles.eyebrow}>{c.working}</span>
              {view.strengths.length ? (
                <ul className={styles.list}>
                  {view.strengths.map(s => <li key={s.key} className={styles.listItem}><span>{s.label}</span><span className={styles.listScore}>{s.score}/100</span></li>)}
                </ul>
              ) : <p className={styles.empty}>{c.noStrengths}</p>}
            </div>
            <div>
              <span className={styles.eyebrow}>{c.holding}</span>
              {view.blockers.length ? (
                <ul className={styles.list}>
                  {view.blockers.map(b => <li key={b.key} className={styles.listItem}><span>{b.label}</span><span className={styles.listScore}>{b.score}/100</span></li>)}
                </ul>
              ) : <p className={styles.empty}>{c.noBlockers}</p>}
            </div>
          </div>
        </section>

        {/* Insights, one per dimension, each with the question that drove it */}
        {view.insights.length > 0 && (
          <section className={styles.card}>
            <h2 className={styles.sectionLabel}>{c.insights}</h2>
            <div className={styles.insights}>
              {view.insights.map(ins => (
                <div key={`${ins.type}-${ins.title}`} className={`${styles.insight} ${ins.type === 'blocker' ? styles.insightBlocker : ''}`}>
                  <div className={styles.insightHead}>
                    <span className={styles.insightTitle}>{ins.title}</span>
                    <span className={styles.tag}>{ins.type === 'strength' ? a.card.strength : a.card.blocker}</span>
                  </div>
                  <div className={styles.insightDriver}>{ins.driver}</div>
                  {ins.desc && <p className={styles.body}>{noStop(ins.desc)}</p>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Quick note and narrative */}
        <section className={styles.card}>
          <h2 className={styles.sectionLabel}>{c.notes}</h2>
          <div className={styles.note}>
            <p className={styles.noteTitle}>{view.quickNote.title}</p>
            <p className={styles.body}>{noStop(view.quickNote.body)}</p>
          </div>
          <p className={styles.body}>{renderWithBold(noStop(view.narrative))}</p>
        </section>

        {/* Closing hook: what only the paid analysis answers */}
        <section className={styles.card}>
          <span className={styles.eyebrow}>{c.notShown}</span>
          <div className={styles.hook} style={{ marginTop: 10 }}>
            <p className={styles.hookLead}>{noStop(view.closingHook.finding)}</p>
            <p className={styles.body}>{noStop(view.closingHook.decline)}</p>
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={() => requestUpgrade({ feature: 'the Business Operations Analysis' })}>{c.upgrade}</button>
          </div>
        </section>

        <div className={styles.footer}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={asset('/Aivory_Aether_white.svg')} alt="Aivory Aether" className={styles.aether} />
        </div>
      </div>
    </div>
  )
}
