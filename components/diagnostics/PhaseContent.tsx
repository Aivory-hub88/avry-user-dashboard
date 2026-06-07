'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { PhaseConfig, DeepDiagnosticQuestion } from '@/types/deepDiagnostic'
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
  // Debounce timers for each question
  const debounceTimers = useRef<Record<string, NodeJS.Timeout>>({})

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

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      Object.values(debounceTimers.current).forEach(timer => clearTimeout(timer))
    }
  }, [])

  // Render input based on question type
  const renderInput = (question: DeepDiagnosticQuestion) => {
    const value = responses[question.id] ?? ''
    const error = validationErrors[question.id]
    const inputId = `question-${question.id}`

    switch (question.type) {
      case 'text':
        return (
          <input
            id={inputId}
            type="text"
            className={`${styles.textInput} ${error ? styles.inputError : ''}`}
            placeholder={question.placeholder}
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
            placeholder={question.placeholder}
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
            <option value="">Select an option...</option>
            {question.options?.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        )

      case 'radio':
        return (
          <div className={styles.radioGroup} role="radiogroup" aria-labelledby={inputId}>
            {question.options?.map((option) => {
              const optionId = `${inputId}-${option.replace(/\s+/g, '-').toLowerCase()}`
              return (
                <label key={option} className={styles.radioLabel} htmlFor={optionId}>
                  <input
                    id={optionId}
                    type="radio"
                    name={question.id}
                    value={option}
                    checked={value === option}
                    onChange={(e) => {
                      onResponseChange(question.id, e.target.value)
                    }}
                    className={styles.radioInput}
                  />
                  <span className={styles.radioText}>{option}</span>
                </label>
              )
            })}
          </div>
        )

      case 'multiselect':
        return (
          <div className={styles.multiselectGroup} role="group" aria-labelledby={inputId}>
            {question.options?.map((option) => {
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
                  <span className={styles.checkboxText}>{option}</span>
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
            placeholder={question.placeholder}
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

  return (
    <div className={styles.phaseContent}>
      <div className={styles.phaseHeader}>
        <h2 className={styles.phaseTitle}>{phase.title}</h2>
        <p className={styles.phaseDescription}>{phase.description}</p>
      </div>

      <div className={styles.questionsList}>
        {phase.questions.map((question, index) => {
          const inputId = `question-${question.id}`
          const error = validationErrors[question.id]

          return (
            <div key={question.id} className={styles.questionItem}>
              <label htmlFor={inputId} className={styles.questionLabel}>
                <span className={styles.questionNumber}>{index + 1}.</span>
                <span className={styles.questionText}>
                  {question.question}
                  {question.required && (
                    <span className={styles.requiredIndicator} aria-label="required">
                      *
                    </span>
                  )}
                </span>
              </label>

              {question.helperText && !error && (
                <p id={`${inputId}-helper`} className={styles.helperText}>
                  {question.helperText}
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
                  {error}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
