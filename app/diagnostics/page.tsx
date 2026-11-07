'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { DeepDiagnosticService } from '@/services/deepDiagnostic'
import { hasCompletedDiagnostic } from '@/lib/diagnosticStatus'
import { useRouterContext } from '@/contexts/RouterContext'
import { ContinuedFromConsole } from '@/components/routing/ContinuedFromConsole'
import GrainHeader from '@/components/ui/GrainHeader'
import styles from './diagnostics.module.css'

export default function DiagnosticsPage() {
  const [deepDiagnosticCompleted, setDeepDiagnosticCompleted] = useState(false)
  const [deepDiagnosticInProgress, setDeepDiagnosticInProgress] = useState(false)
  const [routingNotice, setRoutingNotice] = useState<string | null>(null)
  const t = useTranslations('diagnostics')

  const { pendingContext, clearPendingContext } = useRouterContext()

  useEffect(() => {
    if (!pendingContext) return
    if (Date.now() - pendingContext.timestamp > 5 * 60 * 1000) {
      clearPendingContext()
      return
    }
    if (pendingContext.targetRoute !== 'diagnostic') return
    // Standard fetch-on-mount / sync-from-prop / hydrate-after-mount pattern
    // (functionally correct in this pre-Suspense/pre-React-Query codebase) —
    // not restructuring this component's data flow to satisfy the newer
    // React Compiler style rule; see other documented instances of this.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRoutingNotice(pendingContext.aiReplySummary || pendingContext.triggerMessage)
    clearPendingContext()
  }, [pendingContext, clearPendingContext])

  useEffect(() => {
    // Deep diagnostic status — check for completed result context
    const deepContext = localStorage.getItem('aivory_diagnostic_context')
    if (deepContext) {
      // Standard fetch-on-mount / sync-from-prop / hydrate-after-mount pattern
      // (functionally correct in this pre-Suspense/pre-React-Query codebase) —
      // not restructuring this component's data flow to satisfy the newer
      // React Compiler style rule; see other documented instances of this.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDeepDiagnosticCompleted(true)
    } else {
      // Check if in-progress (has saved progress but no result yet)
      const progress = DeepDiagnosticService.loadProgress()
      if (progress) {
        setDeepDiagnosticInProgress(true)
      }
    }

    // The local cache can be empty on a fresh browser while the account has a
    // saved result — confirm against the server.
    let cancelled = false
    hasCompletedDiagnostic().then(done => {
      if (done && !cancelled) {
        setDeepDiagnosticCompleted(true)
        setDeepDiagnosticInProgress(false)
      }
    })
    return () => { cancelled = true }
  }, [])

  return (
    <div className={`${styles.pageContainer} font-manrope`}>
      <div className={styles.pageContent}>
        {routingNotice !== null && (
          <ContinuedFromConsole
            summary={routingNotice}
            onDismiss={() => setRoutingNotice(null)}
          />
        )}
        <header className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>{t('title')}</h1>
          <p className={styles.pageDescription}>
            Take our comprehensive deep dive analysis to generate a full business operations report.
          </p>
        </header>

        {/* Deep Diagnostic: one grainy-gradient hero card with the status and the next action */}
        <GrainHeader world="harbour" className="rounded-[22px] p-7 md:p-10 shadow-[0_12px_40px_rgba(0,0,0,0.35)]">
          <div className="relative z-10 flex flex-col gap-7 md:flex-row md:items-end md:justify-between">
            <div className="max-w-xl">
              <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] mb-4 px-3 py-1 rounded-full bg-white/[0.14] border border-white/[0.3] backdrop-blur-md">
                {deepDiagnosticCompleted ? 'Report ready' : deepDiagnosticInProgress ? 'In progress' : '4-phase business analysis'}
              </span>
              <h2 className="text-white" style={{ fontSize: 30, fontWeight: 300, lineHeight: 1.2, letterSpacing: '-0.4px', margin: '0 0 12px' }}>
                {t('deepDiagnostic')}
              </h2>
              <p style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.95)', lineHeight: 1.6, margin: 0 }}>
                Covers business objectives, data maturity, risk constraints, and AI opportunity mapping, then turns your answers into a full business operations report with ROI projections.
              </p>
              <div className="flex flex-wrap gap-2 mt-5">
                {['Business objectives', 'Data maturity', 'Risk constraints', 'AI opportunities'].map(label => (
                  <span key={label} className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-white/[0.1] border border-white/[0.22] text-white/90">
                    {label}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-3 shrink-0">
              {deepDiagnosticCompleted ? (
                <>
                  <Link href="/diagnostics/deep/final-result" className={styles.heroPrimary}>View Full Report</Link>
                  <Link href="/diagnostics/deep" className={styles.heroGhost}>Retake Diagnostic</Link>
                </>
              ) : deepDiagnosticInProgress ? (
                <Link href="/diagnostics/deep" className={styles.heroPrimary}>Continue Diagnostic</Link>
              ) : (
                <Link href="/diagnostics/deep" className={styles.heroPrimary}>{t('startDeep')}</Link>
              )}
            </div>
          </div>
        </GrainHeader>
      </div>
    </div>
  )
}
