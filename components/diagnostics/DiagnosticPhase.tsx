import { DiagnosticPhaseConfig } from '@/types/diagnostic'
import styles from './DiagnosticPhase.module.css'

interface DiagnosticPhaseProps {
  config: DiagnosticPhaseConfig
  values: Record<string, any>
  onChange: (fieldId: string, value: any) => void
  validationErrors?: Record<string, string>
  phaseKey?: string
}

export default function DiagnosticPhase({ config, values, onChange, validationErrors = {}, phaseKey = '' }: DiagnosticPhaseProps) {
  const handleFieldChange = (fieldId: string, value: any) => {
    onChange(fieldId, value)
  }

  const getFieldError = (fieldId: string): string | undefined => {
    return validationErrors[`${phaseKey}.${fieldId}`]
  }

  const renderField = (field: any) => {
    const value = values[field.id] || ''
    const error = getFieldError(field.id)
    const hasError = !!error

    switch (field.type) {
      case 'text':
        return (
          <>
            <input
              type="text"
              id={field.id}
              className={`${styles.textInput} ${hasError ? styles.inputError : ''}`}
              placeholder={field.placeholder}
              value={value}
              onChange={(e) => handleFieldChange(field.id, e.target.value)}
              required={field.required}
            />
            {hasError && <p className={styles.errorText}>{error}</p>}
          </>
        )

      case 'textarea':
        return (
          <>
            <textarea
              id={field.id}
              className={`${styles.textareaInput} ${hasError ? styles.inputError : ''}`}
              placeholder={field.placeholder}
              value={value}
              onChange={(e) => handleFieldChange(field.id, e.target.value)}
              required={field.required}
              rows={4}
            />
            {hasError && <p className={styles.errorText}>{error}</p>}
          </>
        )

      case 'select':
        return (
          <>
            <select
              id={field.id}
              className={`${styles.selectInput} ${hasError ? styles.inputError : ''}`}
              value={value}
              onChange={(e) => handleFieldChange(field.id, e.target.value)}
              required={field.required}
            >
              <option value="">Select an option</option>
              {field.options?.map((option: string) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            {hasError && <p className={styles.errorText}>{error}</p>}
          </>
        )

      case 'multiselect':
        const selectedValues = Array.isArray(value) ? value : []
        return (
          <>
            <div className={styles.multiselectContainer}>
              {field.options?.map((option: string) => (
                <label key={option} className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={selectedValues.includes(option)}
                    onChange={(e) => {
                      const newValues = e.target.checked
                        ? [...selectedValues, option]
                        : selectedValues.filter((v: string) => v !== option)
                      handleFieldChange(field.id, newValues)
                    }}
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>
            {hasError && <p className={styles.errorText}>{error}</p>}
          </>
        )

      default:
        return null
    }
  }

  return (
    <div className={styles.phaseCard} data-testid={`phase-${config.phase}`}>
      <div className={styles.phaseHeader}>
        <h2 className={styles.phaseTitle} data-testid={`phase-${config.phase}-title`}>
          Phase {config.phase}: {config.title}
        </h2>
        <p className={styles.phaseDescription} data-testid={`phase-${config.phase}-description`}>
          {config.description}
        </p>
      </div>

      <div className={styles.fieldsContainer}>
        {config.fields.map((field) => (
          <div key={field.id} className={styles.fieldGroup}>
            <label htmlFor={field.id} className={styles.fieldLabel}>
              {field.label}
              {field.required && <span className={styles.required}>*</span>}
            </label>
            {renderField(field)}
            {field.helperText && (
              <p className={styles.helperText}>{field.helperText}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
