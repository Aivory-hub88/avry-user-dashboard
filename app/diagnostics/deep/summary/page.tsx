'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { PhaseId, PhaseData, DeepDiagnosticQuestion } from '@/types/deepDiagnostic'
import { DEEP_DIAGNOSTIC_PHASES } from '@/constants/deepDiagnosticQuestions'
import { ID_PHASE_COPY, ID_QUESTION_COPY } from '@/constants/deepDiagnosticQuestionsId'
import { DeepDiagnosticService, buildDiagnosticContext, ensureLiveRates } from '@/services/deepDiagnostic'
import { useLocaleContext } from '@/hooks/useLocale'
import type { DiagnosticAnswers } from '@/types/diagnostic'
import styles from './summary.module.css'

const PHASE_ORDER: PhaseId[] = [
  'business_objective_kpi',
  'data_process_readiness',
  'risk_constraints',
  'ai_opportunity_mapping',
]

// Displays the stored (canonical, English) answer using its translated label
// when one exists — the underlying value itself is never altered.
function formatAnswer(value: any, question: DeepDiagnosticQuestion, locale: 'en' | 'id'): string {
  if (value === undefined || value === null || value === '') return ''
  const t = locale === 'id' ? ID_QUESTION_COPY[question.id] : undefined
  const translateOne = (v: any): string => {
    if (t?.options && question.options) {
      const idx = question.options.indexOf(v)
      if (idx >= 0 && t.options[idx]) return t.options[idx]
    }
    return String(v)
  }
  if (Array.isArray(value)) return value.map(translateOne).join(', ')
  return translateOne(value)
}

export default function SummaryPage() {
  const router = useRouter()
  const { locale, setLocale } = useLocaleContext()
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

    // Fetch live FX rates before the ROI computation below — best-effort;
    // buildDiagnosticContext falls back to the static snapshot if this fails.
    await ensureLiveRates()

    try {
      const phases = PHASE_ORDER.reduce((acc, id) => {
        acc[id] = phaseData[id]?.responses ?? {}
        return acc
      }, {} as Record<PhaseId, Record<string, any>>)

      // AI analysis is best-effort: if the LLM path fails, the user still gets
      // the full deterministic report (scores/ROI are computed locally anyway).
      try {
        const result = await DeepDiagnosticService.submitDiagnostic(companyName, phases)
        DeepDiagnosticService.saveResult(result)
      } catch (llmErr) {
        console.warn('[DeepDiagnostic] AI analysis failed — continuing with local report:', llmErr)
        DeepDiagnosticService.clearResult()
      }

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
        <div className={styles.spinner} aria-label={locale === 'id' ? 'Memuat...' : 'Loading...'} />
      </div>
    )
  }

  return (
    <div className={styles.pageContainer}>
      <header className={styles.pageHeader}>
        <div className={styles.languageSwitcherRow}>
          <label htmlFor="assessment-lang-summary" className={styles.languageSwitcherLabel}>
            {locale === 'id' ? 'Bahasa' : 'Language'}
          </label>
          <select
            id="assessment-lang-summary"
            className={styles.languageSwitcher}
            value={locale}
            onChange={(e) => setLocale(e.target.value as 'en' | 'id')}
          >
            <option value="en">English</option>
            <option value="id">Bahasa Indonesia</option>
          </select>
        </div>
        <h1 className={styles.pageTitle}>{locale === 'id' ? 'Tinjau Jawaban Anda' : 'Review Your Answers'}</h1>
        <p className={styles.pageSubtitle}>
          {locale === 'id'
            ? 'Luangkan waktu sejenak untuk meninjau sebelum kami menganalisis operasional bisnis Anda.'
            : 'Take a moment to review before we analyse your business operations.'}
        </p>
      </header>

      <main className={styles.mainContent}>
        {DEEP_DIAGNOSTIC_PHASES.map((phase, index) => {
          const data = phaseData[phase.id]
          const responses = data?.responses ?? {}
          const phaseCopy = locale === 'id' ? ID_PHASE_COPY[phase.id] : undefined
          const displayPhaseTitle = phaseCopy?.title ?? phase.title
          const phaseLabel = locale === 'id' ? `Fase ${index + 1}` : `Phase ${index + 1}`
          const editLabel = locale === 'id' ? `Ubah Fase ${index + 1}` : `Edit Phase ${index + 1}`

          return (
            <div key={phase.id} className={styles.phaseCard}>
              <div className={styles.phaseCardHeader}>
                <div className={styles.phaseCardMeta}>
                  <span className={styles.phaseNumber}>{phaseLabel}</span>
                  <h2 className={styles.phaseTitle}>{displayPhaseTitle}</h2>
                </div>
                <button
                  className={styles.editButton}
                  onClick={handleEditPhase}
                  aria-label={`${editLabel}: ${displayPhaseTitle}`}
                >
                  {editLabel}
                </button>
              </div>

              <div className={styles.qaList}>
                {phase.questions.map(question => {
                  const answer = formatAnswer(responses[question.id], question, locale)
                  if (!answer) return null
                  const questionCopy = locale === 'id' ? ID_QUESTION_COPY[question.id] : undefined
                  return (
                    <div key={question.id} className={styles.qaItem}>
                      <p className={styles.questionLabel}>{questionCopy?.question ?? question.question}</p>
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
              {locale === 'id' ? 'Coba Lagi' : 'Retry'}
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
                {locale === 'id' ? 'Mengirim…' : 'Submitting…'}
              </>
            ) : (
              locale === 'id' ? 'Kirim Diagnostik' : 'Submit Diagnostic'
            )}
          </button>
        </div>
      </main>
    </div>
  )
}
