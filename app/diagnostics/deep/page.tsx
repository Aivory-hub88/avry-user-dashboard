'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { PhaseId, PhaseData, DeepDiagnosticProgress } from '@/types/deepDiagnostic'
import { DEEP_DIAGNOSTIC_PHASES } from '@/constants/deepDiagnosticQuestions'
import { ID_PHASE_COPY } from '@/constants/deepDiagnosticQuestionsId'
import { DeepDiagnosticService } from '@/services/deepDiagnostic'
import { normalizeWebsiteInput } from '@/lib/websiteUrl'
import { dropMismatchedBandAnswers } from '@/lib/currencyBands'
import { parseCurrencyCode } from '@/lib/resultFormatters'
import { useLocaleContext } from '@/hooks/useLocale'
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
  const { locale, setLocale } = useLocaleContext()

  const [currentPhase, setCurrentPhase] = useState<PhaseId>('business_objective_kpi')
  const [phaseData, setPhaseData] = useState<Record<PhaseId, PhaseData>>(buildEmptyPhaseData)
  const [companyName, setCompanyName] = useState('')
  const [companyNameError, setCompanyNameError] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [websiteUrlError, setWebsiteUrlError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [savedProgress, setSavedProgress] = useState<DeepDiagnosticProgress | null>(null)
  const [storageWarning, setStorageWarning] = useState(false)

  const saveTimerRef = useRef<NodeJS.Timeout | null>(null)
  const phaseScrollRef = useRef<HTMLDivElement | null>(null)

  // On mount: check for saved progress. Only stage it in `savedProgress` for
  // the resume/start-fresh banner — do NOT apply companyName (or anything
  // else) to live state yet. Applying it here unconditionally meant a user
  // who ignored the banner and just answered fresh questions still had their
  // submission tagged with a leftover company name from an old, unrelated,
  // incomplete session (phaseData correctly stayed empty until Resume was
  // clicked, but companyName didn't wait for that same explicit choice).
  useEffect(() => {
    try {
      const progress = DeepDiagnosticService.loadProgress()
      if (progress) {
        // Standard fetch-on-mount / sync-from-prop / hydrate-after-mount pattern
        // (functionally correct in this pre-Suspense/pre-React-Query codebase) —
        // not restructuring this component's data flow to satisfy the newer
        // React Compiler style rule; see other documented instances of this.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSavedProgress(progress)
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
        DeepDiagnosticService.saveProgress({ phases: phaseData, currentPhase, lastUpdated: new Date().toISOString(), companyName, websiteUrl })
      } catch {
        setStorageWarning(true)
      }
    }, 500)
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [phaseData, currentPhase, companyName, websiteUrl])

  // Every phase change (Next/Previous, sidebar click, Resume) swaps the questions
  // inside an internally scrolling pane, so the previous phase's scroll position
  // would otherwise carry over and land the user mid-page. Reset it to the top.
  // Ancestors are reset too, for the stacked mobile layout where the page scrolls.
  useEffect(() => {
    let el: HTMLElement | null = phaseScrollRef.current
    while (el) {
      if (el.scrollTop > 0) el.scrollTop = 0
      el = el.parentElement
    }
  }, [currentPhase])

  const handleResume = () => {
    if (!savedProgress) return
    setPhaseData(() => {
      const merged = { ...buildEmptyPhaseData(), ...savedProgress.phases }
      // Saved progress can carry band answers from another currency (older
      // builds didn't clear the phase-3 budget on a currency switch) — drop
      // them so the user re-picks against the current currency's bands.
      const currency = parseCurrencyCode(merged.business_objective_kpi?.responses?.currency)
      return dropMismatchedBandAnswers(merged, currency) as Record<PhaseId, PhaseData>
    })
    setCurrentPhase(savedProgress.currentPhase)
    if (savedProgress.companyName) setCompanyName(savedProgress.companyName)
    if (savedProgress.websiteUrl) setWebsiteUrl(savedProgress.websiteUrl)
    setSavedProgress(null)
  }

  const handleStartFresh = useCallback(() => {
    const confirmed = window.confirm(
      locale === 'id'
        ? 'Anda yakin ingin memulai dari awal? Semua progres yang tersimpan akan hilang.'
        : 'Are you sure you want to start fresh? All saved progress will be lost.'
    )
    if (!confirmed) return
    DeepDiagnosticService.clearProgress()
    localStorage.removeItem('aivory_diagnostic_context')
    setPhaseData(buildEmptyPhaseData())
    setCurrentPhase('business_objective_kpi')
    setCompanyName('')
    setCompanyNameError('')
    setValidationErrors({})
    setSavedProgress(null)
  }, [locale])

  const handleResponseChange = useCallback((questionId: string, value: any) => {
    setPhaseData(prev => {
      const nextResponses = {
        ...prev[currentPhase].responses,
        [questionId]: value,
      }
      // Currency switch invalidates band answers: annual_revenue/budget_range
      // store the band label of the currency that was selected when they were
      // answered — keeping them after a switch would silently mix scales
      // (e.g. an IDR juta label scored as a USD $k band). Clear both so the
      // user re-answers against the new currency's bands.
      const next = {
        ...prev,
        [currentPhase]: {
          ...prev[currentPhase],
          responses: nextResponses,
        },
      }
      // Both band answers must go, whichever phase holds them — budget_range
      // lives in phase 3, so clearing only the current phase kept it.
      return questionId === 'currency'
        ? dropMismatchedBandAnswers(next, parseCurrencyCode(value)) as Record<PhaseId, PhaseData>
        : next
    })
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
      setCompanyNameError(locale === 'id' ? 'Nama perusahaan wajib diisi' : 'Company name is required')
      return
    }
    // Optional website: only block when something was typed but isn't a plausible address
    if (currentPhase === PHASE_ORDER[0] && websiteUrl.trim() && !normalizeWebsiteInput(websiteUrl)) {
      setWebsiteUrlError(locale === 'id' ? 'Alamat website tidak valid. Kosongkan jika tidak ada.' : 'That website address looks invalid. Leave it empty if you have none.')
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
        websiteUrl,
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
          <div className={styles.spinner} aria-label={locale === 'id' ? 'Memuat...' : 'Loading...'} />
        </div>
      </DiagnosticErrorBoundary>
    )
  }

  const savedPhaseConfig = savedProgress
    ? DEEP_DIAGNOSTIC_PHASES.find(p => p.id === savedProgress.currentPhase)
    : undefined
  const savedPhaseTitle = savedPhaseConfig
    ? (locale === 'id' ? ID_PHASE_COPY[savedPhaseConfig.id]?.title ?? savedPhaseConfig.title : savedPhaseConfig.title)
    : ''

  return (
    <DiagnosticErrorBoundary>
    <div className={`${styles.pageContainer} font-manrope`}>
      {/* Language switcher */}
      <div className={styles.languageSwitcherRow}>
        <label htmlFor="assessment-lang" className={styles.languageSwitcherLabel}>
          {locale === 'id' ? 'Bahasa' : 'Language'}
        </label>
        <select
          id="assessment-lang"
          className={styles.languageSwitcher}
          value={locale}
          onChange={(e) => setLocale(e.target.value as 'en' | 'id')}
        >
          <option value="en">English</option>
          <option value="id">Bahasa Indonesia</option>
        </select>
      </div>

      {/* Resume banner */}
      {savedProgress && (
        <div className={styles.resumeBanner} role="alert">
          <span className={styles.resumeText}>
            {locale === 'id' ? (
              <>
                Anda memiliki progres tersimpan — lanjutkan dari Fase{' '}
                {PHASE_ORDER.indexOf(savedProgress.currentPhase) + 1}: {savedPhaseTitle}
              </>
            ) : (
              <>
                You have saved progress — resume from Phase{' '}
                {PHASE_ORDER.indexOf(savedProgress.currentPhase) + 1}: {savedPhaseTitle}
              </>
            )}
          </span>
          <div className={styles.resumeActions}>
            <button className={styles.resumeButton} onClick={handleResume}>
              {locale === 'id' ? 'Lanjutkan' : 'Resume'}
            </button>
            <button className={styles.startFreshBannerButton} onClick={handleStartFresh}>
              {locale === 'id' ? 'Mulai Baru' : 'Start Fresh'}
            </button>
          </div>
        </div>
      )}

      {/* Storage warning */}
      {storageWarning && (
        <div className={styles.warningBanner} role="alert">
          {locale === 'id'
            ? 'Progres tidak dapat disimpan di browser Anda. Anda tetap dapat menyelesaikan diagnostik ini, tetapi harus diselesaikan dalam satu sesi.'
            : "Progress cannot be saved in your browser. You can still complete the diagnostic, but you'll need to finish in one session."}
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

          <div ref={phaseScrollRef} className={styles.phaseContentWrapper}>
            {currentPhase === PHASE_ORDER[0] && (
              <div className={styles.companyNameField}>
                <label htmlFor="companyName" className={styles.companyNameLabel}>
                  {locale === 'id' ? 'Nama Perusahaan' : 'Company Name'}
                </label>
                <input
                  id="companyName"
                  type="text"
                  className={`${styles.companyNameInput} ${companyNameError ? styles.companyNameInputError : ''}`}
                  placeholder={locale === 'id' ? 'Masukkan nama perusahaan Anda...' : 'Enter your company name...'}
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
                <label htmlFor="websiteUrl" className={styles.companyNameLabel} style={{ marginTop: 14 }}>
                  {locale === 'id' ? 'Website Perusahaan (opsional)' : 'Company Website (optional)'}
                </label>
                <input
                  id="websiteUrl"
                  type="text"
                  inputMode="url"
                  autoComplete="url"
                  className={`${styles.companyNameInput} ${websiteUrlError ? styles.companyNameInputError : ''}`}
                  placeholder={locale === 'id' ? 'contoh: perusahaananda.co.id' : 'e.g. yourcompany.com'}
                  value={websiteUrl}
                  onChange={e => {
                    setWebsiteUrl(e.target.value)
                    if (websiteUrlError) setWebsiteUrlError('')
                  }}
                  aria-describedby="websiteUrlHelp"
                  aria-invalid={!!websiteUrlError}
                />
                <p id="websiteUrlHelp" className={websiteUrlError ? styles.companyNameError : undefined} role={websiteUrlError ? 'alert' : undefined} style={websiteUrlError ? undefined : { margin: '6px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.45)', fontFamily: 'var(--font-manrope), sans-serif' }}>
                  {websiteUrlError || (locale === 'id'
                    ? 'Jika diisi, kami membaca halaman publik website Anda untuk membuat analisis lebih akurat. Tidak mengubah skor.'
                    : 'If provided, we read your public website pages to make the analysis more accurate. It does not change your score.')}
                </p>
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
          <nav className={styles.bottomNav} aria-label={locale === 'id' ? 'Navigasi fase' : 'Phase navigation'}>
            <button
              className={styles.prevButton}
              onClick={handlePrevious}
              disabled={isFirstPhase}
              aria-disabled={isFirstPhase}
            >
              {locale === 'id' ? '< Fase Sebelumnya' : '< Previous Phase'}
            </button>

            <button
              className={styles.startFreshButton}
              onClick={handleStartFresh}
              type="button"
            >
              {locale === 'id' ? 'Mulai Baru' : 'Start Fresh'}
            </button>

            <button
              className={styles.nextButton}
              onClick={handleNext}
              type="button"
            >
              {locale === 'id'
                ? (isLastPhase ? 'Selesai & Tinjau >' : 'Fase Berikutnya >')
                : (isLastPhase ? 'Complete & Review' : 'Next Phase >')}
            </button>
          </nav>
        </main>
      </div>
    </div>
    </DiagnosticErrorBoundary>
  )
}
