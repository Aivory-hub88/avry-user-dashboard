'use client'

/**
 * /diagnostics for a free account: the free analysis is the primary action,
 * the Deep Diagnostic is shown locked behind the upgrade prompt. Display only:
 * the server refuses a Deep Diagnostic run without a plan regardless.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import GrainHeader from '@/components/ui/GrainHeader'
import PoweredByAether from '@/components/ui/PoweredByAether'
import { LockIcon } from '@/components/upgrade/UpgradeModal'
import { useLocaleContext } from '@/hooks/useLocale'
import { requestUpgrade } from '@/lib/planAccess'
import { cachedResult, fetchFreeAnalysisStatus, loadProgress, type FreeAnalysisStatus } from '@/lib/freeAnalysis/client'
import type { StoredFreeAnalysis } from '@/lib/freeAnalysis/scoring'
import styles from '@/app/diagnostics/diagnostics.module.css'

const COPY = {
  en: {
    title: 'Diagnostics',
    description: 'Start with the free Business Operations Analysis to see where your operations stand today',
    badgeNew: 'Free · about 3 minutes',
    badgeDone: 'Result ready',
    badgeProgress: 'In progress',
    heading: 'Free Business Operations Analysis',
    body: 'Twelve questions on how work runs today. You get an operational maturity score, a five-dimension profile, and the parts of the operation holding you back',
    chips: ['Process', 'Data', 'Strategy', 'Governance', 'People'],
    start: 'Start free analysis',
    resume: 'Continue analysis',
    view: 'View result',
    again: 'Run again',
    lastScore: (s: number, m: string) => `Last score ${s}/100 · ${m}`,
    runsLeft: (n: number) => (n === 1 ? '1 free analysis left' : `${n} free analyses left`),
    noRuns: 'Both free analyses used',
    deepTitle: 'Deep Diagnostic',
    deepBody: 'Four phases on objectives, data maturity, risk constraints and AI opportunities, turned into a full business operations report with ROI projections',
    locked: 'Available on paid plans',
    unlock: 'Unlock Deep Diagnostic',
  },
  id: {
    title: 'Diagnostik',
    description: 'Mulai dengan Analisis Operasional Bisnis gratis untuk melihat posisi operasional Anda saat ini',
    badgeNew: 'Gratis · sekitar 3 menit',
    badgeDone: 'Hasil siap',
    badgeProgress: 'Sedang berjalan',
    heading: 'Analisis Operasional Bisnis Gratis',
    body: 'Dua belas pertanyaan tentang cara kerja berjalan saat ini. Anda mendapat skor kematangan operasional, profil lima dimensi, dan bagian operasional yang menahan Anda',
    chips: ['Proses', 'Data', 'Strategi', 'Tata Kelola', 'SDM'],
    start: 'Mulai analisis gratis',
    resume: 'Lanjutkan analisis',
    view: 'Lihat hasil',
    again: 'Jalankan lagi',
    lastScore: (s: number, m: string) => `Skor terakhir ${s}/100 · ${m}`,
    runsLeft: (n: number) => `Sisa ${n} analisis gratis`,
    noRuns: 'Kedua analisis gratis sudah terpakai',
    deepTitle: 'Deep Diagnostic',
    deepBody: 'Empat fase tentang tujuan, kematangan data, batasan risiko, dan peluang AI, disusun menjadi laporan operasional bisnis lengkap dengan proyeksi ROI',
    locked: 'Tersedia di paket berbayar',
    unlock: 'Buka Deep Diagnostic',
  },
}

export default function FreeDiagnosticsOverview() {
  const { locale } = useLocaleContext()
  const c = COPY[locale === 'id' ? 'id' : 'en']
  const [latest, setLatest] = useState<StoredFreeAnalysis | null>(null)
  const [status, setStatus] = useState<FreeAnalysisStatus | null>(null)
  const [inProgress, setInProgress] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLatest(cachedResult())
    const p = loadProgress()
    setInProgress(!!p && (!!p.companyName || Object.keys(p.answers ?? {}).length > 0))
    let cancelled = false
    fetchFreeAnalysisStatus().then(s => {
      if (cancelled || !s) return
      setStatus(s)
      setLatest(s.latest)
    })
    return () => { cancelled = true }
  }, [])

  const remaining = status?.remaining ?? null
  const canRun = remaining === null || remaining > 0

  return (
    <div className={`${styles.pageContainer} font-manrope`}>
      <div className={styles.pageContent}>
        <header className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>{c.title}</h1>
          <p className={styles.pageDescription}>{c.description}</p>
        </header>

        <GrainHeader world="harbour" className="rounded-[22px] p-7 md:p-10 shadow-[0_12px_40px_rgba(0,0,0,0.35)]">
          <div className="relative z-10 flex flex-col gap-7 md:flex-row md:items-end md:justify-between">
            <div className="max-w-xl">
              <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] mb-4 px-3 py-1 rounded-full bg-white/[0.14] border border-white/[0.3] backdrop-blur-md">
                {latest ? c.badgeDone : inProgress ? c.badgeProgress : c.badgeNew}
              </span>
              <h2 className="text-white" style={{ fontSize: 30, fontWeight: 300, lineHeight: 1.2, letterSpacing: '-0.4px', margin: '0 0 12px' }}>
                {c.heading}
              </h2>
              <p style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.95)', lineHeight: 1.6, margin: 0 }}>
                {latest ? c.lastScore(latest.score, latest.maturity) : c.body}
              </p>
              <div className="flex flex-wrap gap-2 mt-5">
                {c.chips.map(label => (
                  <span key={label} className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-white/[0.1] border border-white/[0.22] text-white/90">{label}</span>
                ))}
              </div>
              {remaining !== null && (
                <p className="mt-4 text-[12px] text-white/80">{remaining > 0 ? c.runsLeft(remaining) : c.noRuns}</p>
              )}
              <PoweredByAether className="mt-6" />
            </div>

            <div className="flex flex-wrap gap-3 shrink-0">
              {latest ? (
                <>
                  <Link href="/diagnostics/free/result" className={styles.heroPrimary}>{c.view}</Link>
                  {canRun && <Link href="/diagnostics/free" className={styles.heroGhost}>{inProgress ? c.resume : c.again}</Link>}
                </>
              ) : (
                <Link href="/diagnostics/free" className={styles.heroPrimary}>{inProgress ? c.resume : c.start}</Link>
              )}
            </div>
          </div>
        </GrainHeader>

        {/* Deep Diagnostic, locked for a free account */}
        <section className={styles.diagnosticSection}>
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="max-w-xl">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] mb-3 text-white/60">
                <LockIcon /> {c.locked}
              </span>
              <h2 className={styles.sectionTitle}>{c.deepTitle}</h2>
              <p className={styles.sectionDescription}>{c.deepBody}</p>
            </div>
            <button type="button" className={styles.diagnosticCta} onClick={() => requestUpgrade({ feature: 'the Deep Diagnostic' })}>
              <LockIcon /> {c.unlock}
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
