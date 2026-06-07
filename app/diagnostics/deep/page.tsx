'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { PhaseId, PhaseData, DeepDiagnosticProgress } from '@/types/deepDiagnostic'
import { DEEP_DIAGNOSTIC_PHASES } from '@/constants/deepDiagnosticQuestions'
import { DeepDiagnosticService } from '@/services/deepDiagnostic'
import PhaseNavigator from '@/components/diagnostics/PhaseNavigator'
import ProgressTracker from '@/components/diagnostics/ProgressTracker'
import PhaseContent from '@/components/diagnostics/PhaseContent'
import styles from './deep-diagnostic.module.css'
import DiagnosticErrorBoundary from '@/components/diagnostics/DiagnosticErrorBoundary'

const PHASE_ORDER: PhaseId[] = [
  'business_objective_kpi',
  'data_process_readiness',
  'risk_constraints',
  'ai_opportunity_mapping',
]

function buildEmptyPhaseData(): Record<PhaseId, PhaseData> {
  return PHASE_ORDER.reduce((acc, id) => {
    acc[id] = { completed: false, responses: {} }
    return acc
  }, {} as Record<PhaseId, PhaseData>)
}

export default function DeepDiagnosticPage() {
  const router = useRouter()

  const [currentPhase, setCurrentPhase] = useState<PhaseId>('business_objective_kpi')
  const [phaseData, setPhaseData] = useState<Record<PhaseId, PhaseData>>(buildEmptyPhaseData)
  const [companyName, setCompanyName] = useState('')
  const [companyNameError, setCompanyNameError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [savedProgress, setSavedProgress] = useState<DeepDiagnosticProgress | null>(null)
  const [storageWarning, setStorageWarning] = useState(false)

  const saveTimerRef = useRef<NodeJS.Timeout | null>(null)

  // On mount: check for saved progress
  useEffect(() => {
    try {
      const progress = DeepDiagnosticService.loadProgress()
      if (progress) {
        setSavedProgress(progress)
        if (progress.companyName) setCompanyName(progress.companyName)
      }
    } catch {
      // localStorage unavailable — continue with in-memory state
      setStorageWarning(true)
    }
    setIsLoading(false)
  }, [])

  // Debounced save on phaseData change (skip initial render)
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      try {
        DeepDiagnosticService.saveProgress({ phases: phaseData, currentPhase, lastUpdated: new Date().toISOString(), companyName })
      } catch {
        setStorageWarning(true)
      }
    }, 500)
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [phaseData, currentPhase, companyName])

  const handleResume = () => {
    if (!savedProgress) return
    setPhaseData(() => {
      const merged = { ...buildEmptyPhaseData(), ...savedProgress.phases }
      return merged as Record<PhaseId, PhaseData>
    })
    setCurrentPhase(savedProgress.currentPhase)
    if (savedProgress.companyName) setCompanyName(savedProgress.companyName)
    setSavedProgress(null)
  }

  const handleStartFresh = useCallback(() => {
    const confirmed = window.confirm('Are you sure you want to start fresh? All saved progress will be lost.')
    if (!confirmed) return
    DeepDiagnosticService.clearProgress()
    localStorage.removeItem('aivory_diagnostic_context')
    setPhaseData(buildEmptyPhaseData())
    setCurrentPhase('business_objective_kpi')
    setCompanyName('')
    setCompanyNameError('')
    setValidationErrors({})
    setSavedProgress(null)
  }, [])

  const handleResponseChange = useCallback((questionId: string, value: any) => {
    setPhaseData(prev => ({
      ...prev,
      [currentPhase]: {
        ...prev[currentPhase],
        responses: {
          ...prev[currentPhase].responses,
          [questionId]: value,
        },
      },
    }))
    // Clear validation error for this field on change
    setValidationErrors(prev => {
      if (!prev[questionId]) return prev
      const next = { ...prev }
      delete next[questionId]
      return next
    })
  }, [currentPhase])

  const handleNavigate = useCallback((phaseId: PhaseId) => {
    setCurrentPhase(phaseId)
    setValidationErrors({})
  }, [])

  const handlePrevious = () => {
    const idx = PHASE_ORDER.indexOf(currentPhase)
    if (idx > 0) {
      setCurrentPhase(PHASE_ORDER[idx - 1])
      setValidationErrors({})
    }
  }

  const handleNext = () => {
    // Validate company name before leaving the first phase
    if (currentPhase === PHASE_ORDER[0] && !companyName.trim()) {
      setCompanyNameError('Company name is required')
      return
    }

    const currentPhaseConfig = DEEP_DIAGNOSTIC_PHASES.find(p => p.id === currentPhase)!
    const responses = phaseData[currentPhase].responses
    const errors = DeepDiagnosticService.validatePhase(currentPhaseConfig, responses)

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors)
      return
    }

    // Mark current phase complete
    const updatedPhaseData = {
      ...phaseData,
      [currentPhase]: { ...phaseData[currentPhase], completed: true },
    }
    setPhaseData(updatedPhaseData)
    setValidationErrors({})

    const idx = PHASE_ORDER.indexOf(currentPhase)
    const isLastPhase = idx === PHASE_ORDER.length - 1

    if (isLastPhase) {
      // Save final state then navigate to summary
      DeepDiagnosticService.saveProgress({
        phases: updatedPhaseData,
        currentPhase,
        lastUpdated: new Date().toISOString(),
        companyName,
      })
      router.push('/diagnostics/deep/summary')
    } else {
      setCurrentPhase(PHASE_ORDER[idx + 1])
    }
  }

  const completedPhases = PHASE_ORDER.filter(id => phaseData[id]?.completed)
  const currentPhaseIndex = PHASE_ORDER.indexOf(currentPhase) + 1
  const isFirstPhase = currentPhase === PHASE_ORDER[0]
  const isLastPhase = currentPhase === PHASE_ORDER[PHASE_ORDER.length - 1]
  const currentPhaseConfig = DEEP_DIAGNOSTIC_PHASES.find(p => p.id === currentPhase)!

  if (isLoading) {
    return (
      <DiagnosticErrorBoundary>
        <div className={styles.loadingContainer}>
          <div className={styles.spinner} aria-label="Loading..." />
        </div>
      </DiagnosticErrorBoundary>
    )
  }

  return (
    <DiagnosticErrorBoundary>
    <div className={styles.pageContainer}>
      {/* Resume banner */}
      {savedProgress && (
        <div className={styles.resumeBanner} role="alert">
          <span className={styles.resumeText}>
            You have saved progress — resume from Phase{' '}
            {PHASE_ORDER.indexOf(savedProgress.currentPhase) + 1}:{' '}
            {DEEP_DIAGNOSTIC_PHASES.find(p => p.id === savedProgress.currentPhase)?.title}
          </span>
          <div className={styles.resumeActions}>
            <button className={styles.resumeButton} onClick={handleResume}>
              Resume
            </button>
            <button className={styles.startFreshBannerButton} onClick={handleStartFresh}>
              Start Fresh
            </button>
          </div>
        </div>
      )}

      {/* Storage warning */}
      {storageWarning && (
        <div className={styles.warningBanner} role="alert">
          Progress cannot be saved in your browser. You can still complete the diagnostic, but you'll need to finish in one session.
        </div>
      )}

      <div className={styles.layout}>
        {/* Left sidebar: Phase Navigator */}
        <aside className={styles.sidebar}>
          <PhaseNavigator
            phases={DEEP_DIAGNOSTIC_PHASES}
            currentPhase={currentPhase}
            completedPhases={completedPhases}
            onNavigate={handleNavigate}
          />
        </aside>

        {/* Main content */}
        <main className={styles.mainContent}>
          <ProgressTracker
            totalPhases={PHASE_ORDER.length}
            completedPhases={completedPhases.length}
            currentPhase={currentPhaseIndex}
          />

          <div className={styles.phaseContentWrapper}>
            {currentPhase === PHASE_ORDER[0] && (
              <div className={styles.companyNameField}>
                <label htmlFor="companyName" className={styles.companyNameLabel}>
                  Company Name
                </label>
                <input
                  id="companyName"
                  type="text"
                  className={`${styles.companyNameInput} ${companyNameError ? styles.companyNameInputError : ''}`}
                  placeholder="Enter your company name..."
                  value={companyName}
                  onChange={e => {
                    setCompanyName(e.target.value)
                    if (e.target.value.trim()) setCompanyNameError('')
                  }}
                  aria-describedby={companyNameError ? 'companyNameError' : undefined}
                  aria-invalid={!!companyNameError}
                />
                {companyNameError && (
                  <p id="companyNameError" className={styles.companyNameError} role="alert">
                    {companyNameError}
                  </p>
                )}
              </div>
            )}
            <PhaseContent
              phase={currentPhaseConfig}
              responses={phaseData[currentPhase].responses}
              onResponseChange={handleResponseChange}
              validationErrors={validationErrors}
            />
          </div>

          {/* Bottom navigation */}
          <nav className={styles.bottomNav} aria-label="Phase navigation">
            <button
              className={styles.prevButton}
              onClick={handlePrevious}
              disabled={isFirstPhase}
              aria-disabled={isFirstPhase}
            >
              &lt; Previous Phase
            </button>

            <button
              className={styles.startFreshButton}
              onClick={handleStartFresh}
              type="button"
            >
              Start Fresh
            </button>

            <button
              className={styles.nextButton}
              onClick={handleNext}
              type="button"
            >
              {isLastPhase ? 'Complete & Review' : 'Next Phase >'}
            </button>
          </nav>
        </main>
      </div>
    </div>
    </DiagnosticErrorBoundary>
  )
}
