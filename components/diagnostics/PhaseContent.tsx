'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { PhaseConfig, DeepDiagnosticQuestion } from '@/types/deepDiagnostic'
import { useLocaleContext } from '@/hooks/useLocale'
import { ID_PHASE_COPY, ID_QUESTION_COPY } from '@/constants/deepDiagnosticQuestionsId'
import { parseCurrencyCode } from '@/lib/resultFormatters'
import { getBudgetBands, getRevenueBands } from '@/lib/currencyBands'
import styles from './PhaseContent.module.css'

interface PhaseContentProps {
  phase: PhaseConfig
  responses: Record<string, any>
  onResponseChange: (questionId: string, value: any) => void
  validationErrors: Record<string, string>
}

export default function PhaseContent({
  phase,
  responses,
  onResponseChange,
  validationErrors
}: PhaseContentProps) {
  const { locale } = useLocaleContext()

  // Debounce timers for each question
  const debounceTimers = useRef<Record<string, NodeJS.Timeout>>({})

  // Auto-scroll to the first unfilled (errored) question when phase
  // validation fails — the error text alone is easy to miss above the fold
  // in long phases. Re-runs whenever the error set changes; a clean error
  // set scrolls nowhere.
  useEffect(() => {
    const firstErrorId = phase.questions.find((q) => validationErrors[q.id])?.id
    if (!firstErrorId) return
    // rAF: the error class/styles render in the same commit — wait one frame
    // so the anchor position is final before scrolling.
    const raf = requestAnimationFrame(() => {
      document
        .getElementById(`question-${firstErrorId}-anchor`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    return () => cancelAnimationFrame(raf)
  }, [validationErrors, phase.questions])

  // Handle response change with debouncing
  const handleChange = useCallback((questionId: string, value: any) => {
    // Clear existing timer for this question
    if (debounceTimers.current[questionId]) {
      clearTimeout(debounceTimers.current[questionId])
    }

    // Set new timer (500ms debounce)
    debounceTimers.current[questionId] = setTimeout(() => {
      onResponseChange(questionId, value)
    }, 500)
  }, [onResponseChange])

  // Cleanup timers on unmount. `debounceTimers.current` is captured here
  // (not re-read inside the cleanup) since the ref's underlying object is
  // mutated in place by handleChange, never reassigned — the captured
  // reference still points at the same, fully up-to-date dictionary by
  // unmount time.
  useEffect(() => {
    const timers = debounceTimers.current
    return () => {
      Object.values(timers).forEach(timer => clearTimeout(timer))
    }
  }, [])

  // Render input based on question type
  const renderInput = (question: DeepDiagnosticQuestion) => {
    const value = responses[question.id] ?? ''
    const error = validationErrors[question.id]
    const inputId = `question-${question.id}`

    // Display-only Indonesian labels, keyed off the canonical question id.
    // The `value`/`onResponseChange` payload always stays the canonical
    // (English) option string from `question.options` — never the
    // translated label — so the scorer and stored answers are unaffected.
    const t = locale === 'id' ? ID_QUESTION_COPY[question.id] : undefined
    const displayPlaceholder = t?.placeholder ?? question.placeholder
    let displayOptions = question.options?.map((option, i) => t?.options?.[i] ?? option)

    // Currency-aware band questions (annual_revenue, budget_range): options
    // come from the per-currency band tables (lib/currencyBands.ts), not the
    // static USD list. The stored value is the band's canonical EN label;
    // the displayed label is the band's locale-specific one. ID_QUESTION_COPY
    // index-translation is deliberately bypassed for these two ids — their
    // option lists are dynamic, so a fixed index map can't track them.
    const isBandQuestion = question.id === 'annual_revenue' || question.id === 'budget_range'
    let effectiveOptions = question.options
    if (isBandQuestion && question.options) {
      const currencyCode = parseCurrencyCode(responses['currency'])
      const bands = question.id === 'annual_revenue'
        ? getRevenueBands(currencyCode)
        : getBudgetBands(currencyCode)
      effectiveOptions = bands.map((b) => b.en)
      displayOptions = bands.map((b) => (locale === 'id' ? b.id : b.en))
    }

    switch (question.type) {
      case 'text':
        return (
          <input
            id={inputId}
            type="text"
            className={`${styles.textInput} ${error ? styles.inputError : ''}`}
            placeholder={displayPlaceholder}
            defaultValue={value}
            onChange={(e) => handleChange(question.id, e.target.value)}
            aria-invalid={!!error}
            aria-describedby={error ? `${inputId}-error` : question.helperText ? `${inputId}-helper` : undefined}
          />
        )

      case 'textarea':
        return (
          <textarea
            id={inputId}
            className={`${styles.textareaInput} ${error ? styles.inputError : ''}`}
            placeholder={displayPlaceholder}
            defaultValue={value}
            onChange={(e) => handleChange(question.id, e.target.value)}
            rows={4}
            aria-invalid={!!error}
            aria-describedby={error ? `${inputId}-error` : question.helperText ? `${inputId}-helper` : undefined}
          />
        )

      case 'select':
        return (
          <select
            id={inputId}
            className={`${styles.selectInput} ${error ? styles.inputError : ''}`}
            value={value}
            onChange={(e) => {
              onResponseChange(question.id, e.target.value)
            }}
            aria-invalid={!!error}
            aria-describedby={error ? `${inputId}-error` : question.helperText ? `${inputId}-helper` : undefined}
          >
            <option value="">{locale === 'id' ? 'Pilih salah satu...' : 'Select an option...'}</option>
            {effectiveOptions?.map((option, i) => (
              <option key={option} value={option}>
                {displayOptions?.[i] ?? option}
              </option>
            ))}
          </select>
        )

      case 'radio':
        return (
          <div className={styles.radioGroup} role="radiogroup" aria-labelledby={inputId}>
            {effectiveOptions?.map((option, i) => {
              const optionId = `${inputId}-${option.replace(/\s+/g, '-').toLowerCase()}`
              const isSelected = value === option
              // Selecting a radio is a discrete choice — commit immediately and
              // make the entire row reliably clickable/keyboard-operable so the
              // selection always persists (fixes unresponsive radio selection).
              const select = () => onResponseChange(question.id, option)
              return (
                <label
                  key={option}
                  className={`${styles.radioLabel} ${isSelected ? styles.radioLabelSelected : ''}`}
                  htmlFor={optionId}
                  onClick={select}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      select()
                    }
                  }}
                  tabIndex={0}
                  role="radio"
                  aria-checked={isSelected}
                >
                  <input
                    id={optionId}
                    type="radio"
                    name={question.id}
                    value={option}
                    checked={isSelected}
                    onChange={select}
                    className={styles.radioInput}
                    tabIndex={-1}
                  />
                  <span className={styles.radioText}>{displayOptions?.[i] ?? option}</span>
                </label>
              )
            })}
          </div>
        )

      case 'multiselect':
        return (
          <div className={styles.multiselectGroup} role="group" aria-labelledby={inputId}>
            {effectiveOptions?.map((option, i) => {
              const optionId = `${inputId}-${option.replace(/\s+/g, '-').toLowerCase()}`
              const selectedValues = Array.isArray(value) ? value : []
              const isChecked = selectedValues.includes(option)

              return (
                <label key={option} className={styles.checkboxLabel} htmlFor={optionId}>
                  <input
                    id={optionId}
                    type="checkbox"
                    value={option}
                    checked={isChecked}
                    onChange={(e) => {
                      const newValues = isChecked
                        ? selectedValues.filter((v: string) => v !== option)
                        : [...selectedValues, option]
                      onResponseChange(question.id, newValues)
                    }}
                    className={styles.checkboxInput}
                  />
                  <span className={styles.checkboxText}>{displayOptions?.[i] ?? option}</span>
                </label>
              )
            })}
          </div>
        )

      case 'number':
        return (
          <input
            id={inputId}
            type="number"
            className={`${styles.numberInput} ${error ? styles.inputError : ''}`}
            placeholder={displayPlaceholder}
            value={value}
            onChange={(e) => {
              const numValue = e.target.value === '' ? '' : Number(e.target.value)
              onResponseChange(question.id, numValue)
            }}
            min={question.validation?.min}
            max={question.validation?.max}
            aria-invalid={!!error}
            aria-describedby={error ? `${inputId}-error` : question.helperText ? `${inputId}-helper` : undefined}
          />
        )

      default:
        return null
    }
  }

  const phaseCopy = locale === 'id' ? ID_PHASE_COPY[phase.id] : undefined

  return (
    <div className={styles.phaseContent}>
      <div className={styles.phaseHeader}>
        <h2 className={styles.phaseTitle}>{phaseCopy?.title ?? phase.title}</h2>
        <p className={styles.phaseDescription}>{phaseCopy?.description ?? phase.description}</p>
      </div>

      <div className={styles.questionsList}>
        {phase.questions.map((question, index) => {
          const inputId = `question-${question.id}`
          const error = validationErrors[question.id]
          const t = locale === 'id' ? ID_QUESTION_COPY[question.id] : undefined

          return (
            <div
              key={question.id}
              id={`${inputId}-anchor`}
              className={`${styles.questionItem} ${error ? styles.questionItemError ?? '' : ''}`}
              data-unfilled={error ? 'true' : undefined}
            >
              <label htmlFor={inputId} className={styles.questionLabel}>
                <span className={styles.questionNumber}>{index + 1}.</span>
                <span className={styles.questionText}>
                  {t?.question ?? question.question}
                  {question.required && (
                    <span className={styles.requiredIndicator} aria-label="required">
                      *
                    </span>
                  )}
                  {error && (
                    <span
                      className={styles.unfilledBadge ?? ''}
                      style={{
                        display: 'inline-block',
                        marginLeft: '8px',
                        padding: '2px 8px',
                        borderRadius: '999px',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        background: 'rgba(220, 38, 38, 0.12)',
                        color: '#f87171',
                        border: '1px solid rgba(220, 38, 38, 0.35)',
                        verticalAlign: 'middle',
                      }}
                    >
                      {locale === 'id' ? 'Belum diisi' : 'Not filled in'}
                    </span>
                  )}
                </span>
              </label>

              {question.helperText && !error && (
                <p id={`${inputId}-helper`} className={styles.helperText}>
                  {t?.helperText ?? question.helperText}
                </p>
              )}

              <div className={styles.inputWrapper}>
                {renderInput(question)}
              </div>

              {error && (
                <p
                  id={`${inputId}-error`}
                  className={styles.errorText}
                  role="alert"
                  aria-live="polite"
                >
                  {/* validatePhase emits canonical English messages; surface
                      the required-field one in the UI locale. Other messages
                      (min/max length) pass through as-is. */}
                  {error === 'This field is required'
                    ? (locale === 'id' ? 'Bagian ini belum diisi' : error)
                    : error === 'Please select at least one option'
                      ? (locale === 'id' ? 'Pilih minimal satu opsi' : error)
                      : error}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
