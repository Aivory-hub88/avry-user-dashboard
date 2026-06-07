'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FREE_DIAGNOSTIC_QUESTIONS } from '@/constants/freeDiagnosticQuestions'
import { FreeDiagnosticAnswers } from '@/types/freeDiagnostic'
import { FreeDiagnosticService } from '@/services/freeDiagnostic'
import QuestionCard from '@/components/diagnostics/QuestionCard'
import ProgressIndicator from '@/components/diagnostics/ProgressIndicator'
import NavigationControls from '@/components/diagnostics/NavigationControls'
import styles from './free-diagnostic.module.css'

export default function FreeDiagnosticPage() {
  const router = useRouter()
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState<FreeDiagnosticAnswers>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  const currentQuestion = FREE_DIAGNOSTIC_QUESTIONS[currentQuestionIndex]
  const isLastQuestion = currentQuestionIndex === FREE_DIAGNOSTIC_QUESTIONS.length - 1
  const hasAnswer = answers[currentQuestion.id] !== undefined

  const handleSelectOption = (optionIndex: number) => {
    setAnswers(prev => ({
      ...prev,
      [currentQuestion.id]: optionIndex
    }))
    setValidationError(null)
  }

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1)
      setValidationError(null)
    }
  }

  const handleNext = async () => {
    // Validate selection
    if (!hasAnswer) {
      setValidationError('Please select an answer before continuing')
      return
    }

    setValidationError(null)

    // If last question, submit
    if (isLastQuestion) {
      await handleSubmit()
    } else {
      setCurrentQuestionIndex(prev => prev + 1)
    }
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)

    try {
      const result = await FreeDiagnosticService.submitDiagnostic('demo_org', answers)
      
      // Save result to localStorage
      FreeDiagnosticService.saveResult(result)
      
      // Navigate to results page
      router.push('/diagnostics/free/result')
    } catch (error) {
      console.error('[FreeDiagnostic] Submission failed:', error)
      setValidationError(
        error instanceof Error 
          ? error.message 
          : 'Failed to submit diagnostic. Please try again.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageContent}>
        <header className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Free AI Readiness Diagnostic</h1>
          <p className={styles.pageDescription}>
            12 quick questions to assess your organization's AI readiness and get a scoring card.
          </p>
        </header>

        <ProgressIndicator
          currentQuestion={currentQuestionIndex + 1}
          totalQuestions={FREE_DIAGNOSTIC_QUESTIONS.length}
        />

        <QuestionCard
          question={currentQuestion}
          selectedOption={answers[currentQuestion.id] ?? null}
          onSelect={handleSelectOption}
        />

        {validationError && (
          <div className={styles.validationError} role="alert" aria-live="assertive">
            {validationError}
          </div>
        )}

        {isSubmitting && (
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <p>Analyzing your AI readiness...</p>
          </div>
        )}

        {!isSubmitting && (
          <NavigationControls
            onPrevious={handlePrevious}
            onNext={handleNext}
            isPreviousDisabled={currentQuestionIndex === 0}
            isNextDisabled={false}
            isLastQuestion={isLastQuestion}
          />
        )}
      </div>
    </div>
  )
}
