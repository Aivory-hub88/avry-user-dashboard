'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { PhaseId, PhaseData } from '@/types/deepDiagnostic'
import { DEEP_DIAGNOSTIC_PHASES } from '@/constants/deepDiagnosticQuestions'
import { DeepDiagnosticService, buildDiagnosticContext } from '@/services/deepDiagnostic'
import type { DiagnosticAnswers } from '@/types/diagnostic'
import styles from './summary.module.css'

const PHASE_ORDER: PhaseId[] = [
  'business_objective_kpi',
  'data_process_readiness',
  'risk_constraints',
  'ai_opportunity_mapping',
]

function formatAnswer(value: any): string {
  if (value === undefined || value === null || value === '') return ''
  if (Array.isArray(value)) return value.join(', ')
  return String(value)
}

export default function SummaryPage() {
  const router = useRouter()
  const [phaseData, setPhaseData] = useState<Record<PhaseId, PhaseData> | null>(null)
  const [companyName, setCompanyName] = useState('demo_org')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const progress = DeepDiagnosticService.loadProgress()
    if (!progress) {
      router.push('/diagnostics/deep')
      return
    }
    setPhaseData(progress.phases)
    if (progress.companyName?.trim()) setCompanyName(progress.companyName.trim())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleEditPhase = () => {
    router.push('/diagnostics/deep')
  }

  const handleSubmit = async () => {
    if (!phaseData) return
    setIsSubmitting(true)
    setError(null)

    try {
      const phases = PHASE_ORDER.reduce((acc, id) => {
        acc[id] = phaseData[id]?.responses ?? {}
        return acc
      }, {} as Record<PhaseId, Record<string, any>>)

      const result = await DeepDiagnosticService.submitDiagnostic(companyName, phases)
      DeepDiagnosticService.saveResult(result)

      // Build rich DiagnosticContext and write to localStorage for the final-result page
      const flattenedAnswers: DiagnosticAnswers = {}
      for (const phaseId of PHASE_ORDER) {
        Object.assign(flattenedAnswers, phaseData[phaseId]?.responses ?? {})
      }
      flattenedAnswers['companyName'] = companyName
      buildDiagnosticContext(flattenedAnswers)

      router.push('/diagnostics/deep/final-result')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed. Please try again.')
      setIsSubmitting(false)
    }
  }

  if (!phaseData) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner} aria-label="Loading..." />
      </div>
    )
  }

  return (
    <div className={styles.pageContainer}>
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Review Your Answers</h1>
        <p className={styles.pageSubtitle}>
          Take a moment to review before we analyze your AI readiness.
        </p>
      </header>

      <main className={styles.mainContent}>
        {DEEP_DIAGNOSTIC_PHASES.map((phase, index) => {
          const data = phaseData[phase.id]
          const responses = data?.responses ?? {}

          return (
            <div key={phase.id} className={styles.phaseCard}>
              <div className={styles.phaseCardHeader}>
                <div className={styles.phaseCardMeta}>
                  <span className={styles.phaseNumber}>Phase {index + 1}</span>
                  <h2 className={styles.phaseTitle}>{phase.title}</h2>
                </div>
                <button
                  className={styles.editButton}
                  onClick={handleEditPhase}
                  aria-label={`Edit Phase ${index + 1}: ${phase.title}`}
                >
                  Edit Phase {index + 1}
                </button>
              </div>

              <div className={styles.qaList}>
                {phase.questions.map(question => {
                  const answer = formatAnswer(responses[question.id])
                  if (!answer) return null
                  return (
                    <div key={question.id} className={styles.qaItem}>
                      <p className={styles.questionLabel}>{question.question}</p>
                      <p className={styles.answerText}>{answer}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        {error && (
          <div className={styles.errorBox} role="alert">
            <p className={styles.errorMessage}>{error}</p>
            <button
              className={styles.retryButton}
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              Retry
            </button>
          </div>
        )}

        <div className={styles.submitRow}>
          <button
            className={styles.submitButton}
            onClick={handleSubmit}
            disabled={isSubmitting}
            aria-busy={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <span className={styles.buttonSpinner} aria-hidden="true" />
                Submitting…
              </>
            ) : (
              'Submit Diagnostic'
            )}
          </button>
        </div>
      </main>
    </div>
  )
}
