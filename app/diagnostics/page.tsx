'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { DeepDiagnosticService } from '@/services/deepDiagnostic'
import { useRouterContext } from '@/contexts/RouterContext'
import { ContinuedFromConsole } from '@/components/routing/ContinuedFromConsole'
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
    setRoutingNotice(pendingContext.aiReplySummary || pendingContext.triggerMessage)
    clearPendingContext()
  }, [pendingContext, clearPendingContext])

  useEffect(() => {
    // Deep diagnostic status — check for completed result context
    const deepContext = localStorage.getItem('aivory_diagnostic_context')
    if (deepContext) {
      setDeepDiagnosticCompleted(true)
    } else {
      // Check if in-progress (has saved progress but no result yet)
      const progress = DeepDiagnosticService.loadProgress()
      if (progress) {
        setDeepDiagnosticInProgress(true)
      }
    }
  }, [])

  return (
    <div className={styles.pageContainer}>
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
            Take our comprehensive deep dive assessment to generate a full AI readiness report.
          </p>
        </header>

        {/* Deep Diagnostic Section */}
        <div className={styles.diagnosticSection}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>{t('deepDiagnostic')}</h2>
            <p className={styles.sectionDescription}>
              4-phase comprehensive assessment covering business objectives, data readiness, risk constraints, and AI opportunity mapping. Generates a full AI readiness report with ROI projections.
            </p>
          </div>

          <div className={styles.deepDiagnosticContent}>
            {deepDiagnosticCompleted ? (
              <div className={styles.completedState}>
                <div className={styles.scoreDisplay}>
                  <span className={styles.scoreLabel}>Status:</span>
                  <span className={styles.scoreValue} style={{ color: '#00e59e', fontSize: '0.9rem' }}>Report Ready</span>
                </div>
                <div className={styles.completedActions}>
                  <Link href="/diagnostics/deep/final-result" className={styles.diagnosticCta}>
                    View Full Report
                  </Link>
                  <Link href="/diagnostics/deep" className={styles.retakeButton} style={{ display: 'inline-block', textAlign: 'center' }}>
                    Retake Diagnostic
                  </Link>
                </div>
              </div>
            ) : deepDiagnosticInProgress ? (
              <div className={styles.completedState}>
                <div className={styles.scoreDisplay}>
                  <span className={styles.scoreLabel}>Status:</span>
                  <span className={styles.scoreValue} style={{ color: '#fbbf24', fontSize: '0.9rem' }}>In Progress</span>
                </div>
                <div className={styles.completedActions}>
                  <Link href="/diagnostics/deep" className={styles.diagnosticCta}>
                    Continue Diagnostic
                  </Link>
                </div>
              </div>
            ) : (
              <Link href="/diagnostics/deep" className={styles.diagnosticCta}>
                {t('startDeep')}
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
