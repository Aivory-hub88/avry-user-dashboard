'use client'

import React, { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import {
  loadCredentials,
  isValidN8nUrl,
  normalizeN8nBaseUrl,
  N8nCredentials,
} from '@/lib/workflows/credentialStore'
import { isAdmin } from '@/lib/auth'
import styles from './ActivationModal.module.css'

export interface ActivationModalProps {
  open: boolean
  onClose: () => void
  onSubmit: (credentials: N8nCredentials) => void
  loading: boolean
}

export const ActivationModal: React.FC<ActivationModalProps> = ({
  open,
  onClose,
  onSubmit,
  loading,
}) => {
  const t = useTranslations('workflow')

  const [instanceUrl, setInstanceUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [storagePreference, setStoragePreference] = useState<'localStorage' | 'database'>('localStorage')
  const [showApiKey, setShowApiKey] = useState(false)
  const [urlTouched, setUrlTouched] = useState(false)
  const [useAivoryInstance, setUseAivoryInstance] = useState(false)
  const [isSuperadmin, setIsSuperadmin] = useState(false)

  // Pre-fill from stored credentials on mount
  useEffect(() => {
    if (open) {
      const stored = loadCredentials()
      if (stored) {
        setInstanceUrl(stored.instanceUrl)
        setApiKey(stored.apiKey)
        setStoragePreference(stored.storageType)
      }
      // Superadmins get a one-click path onto Aivory's own n8n for testing.
      // This only decides whether the option is rendered — the server verifies
      // the JWT claim again before it will touch the shared instance.
      setIsSuperadmin(isAdmin())
    }
  }, [open])

  const urlValid = isValidN8nUrl(instanceUrl)
  const apiKeyValid = apiKey.trim().length > 0
  // The Aivory instance needs no credentials from the user at all.
  const canSubmit = (useAivoryInstance || (urlValid && apiKeyValid)) && !loading

  // Users paste the address bar from their n8n tab, which carries the editor
  // route and query (…/workflow/AbC123?projectId=…). The REST API lives on the
  // base URL, so trim it back on blur — visibly, so the corrected value is what
  // they see and save, rather than being silently rewritten at submit time.
  const normalizedUrl = normalizeN8nBaseUrl(instanceUrl)
  const urlWasTrimmed = urlValid && normalizedUrl !== instanceUrl.trim()

  const handleUrlBlur = () => {
    setUrlTouched(true)
    if (urlWasTrimmed) setInstanceUrl(normalizedUrl)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    onSubmit({
      instanceUrl: useAivoryInstance ? '' : normalizeN8nBaseUrl(instanceUrl),
      apiKey: useAivoryInstance ? '' : apiKey.trim(),
      storagePreference,
      useAivoryInstance,
    })
  }

  if (!open) return null

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit} className={styles.form}>
          {/* Header */}
          <div className={styles.header}>
            <h2 className={styles.title}>{t('activationModal.title')}</h2>
            <button
              type="button"
              className={styles.closeBtn}
              onClick={onClose}
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {/* Superadmin: deploy straight into Aivory's own n8n for testing */}
          {isSuperadmin && (
            <label className={styles.testInstance}>
              <input
                type="checkbox"
                checked={useAivoryInstance}
                onChange={(e) => setUseAivoryInstance(e.target.checked)}
              />
              <span className={styles.testInstanceText}>
                <span className={styles.testInstanceTitle}>
                  Use the Aivory test instance
                  <span className={styles.badge}>Superadmin</span>
                </span>
                <span className={styles.testInstanceDesc}>
                  Deploys to Aivory&apos;s own n8n so you can watch the run. No URL or API key
                  needed — the server holds them.
                </span>
              </span>
            </label>
          )}

          {/* n8n Instance URL */}
          <div className={styles.fieldGroup} hidden={useAivoryInstance}>
            <label className={styles.label} htmlFor="n8n-url">
              {t('activationModal.urlLabel')}
            </label>
            <input
              id="n8n-url"
              type="text"
              className={styles.input}
              placeholder="https://your-n8n.example.com"
              value={instanceUrl}
              onChange={(e) => setInstanceUrl(e.target.value)}
              onBlur={handleUrlBlur}
              autoComplete="url"
            />
            {urlTouched && instanceUrl.length > 0 && !urlValid && (
              <span className={styles.validationError}>
                {t('activationModal.urlInvalid')}
              </span>
            )}
            {urlWasTrimmed && (
              <span className={styles.validationHint}>
                Using <strong>{normalizedUrl}</strong> — the workflow path was removed.
              </span>
            )}
          </div>

          {/* API Key */}
          <div className={styles.fieldGroup} hidden={useAivoryInstance}>
            <label className={styles.label} htmlFor="n8n-api-key">
              {t('activationModal.apiKeyLabel')}
            </label>
            <div className={styles.apiKeyRow}>
              <input
                id="n8n-api-key"
                type={showApiKey ? 'text' : 'password'}
                className={styles.input}
                placeholder="n8n_api_..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                autoComplete="off"
              />
              <button
                type="button"
                className={styles.revealBtn}
                onClick={() => setShowApiKey(!showApiKey)}
                aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
              >
                {showApiKey ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Storage Preference — nothing is stored for the Aivory instance */}
          <div className={styles.fieldGroup} hidden={useAivoryInstance}>
            <span className={styles.label}>
              {t('activationModal.storageLabel')}
            </span>
            <div className={styles.radioGroup}>
              <label className={styles.radioOption}>
                <input
                  type="radio"
                  name="storagePreference"
                  value="localStorage"
                  checked={storagePreference === 'localStorage'}
                  onChange={() => setStoragePreference('localStorage')}
                />
                <div className={styles.radioContent}>
                  <span className={styles.radioTitle}>
                    {t('activationModal.storageLocalTitle')}
                  </span>
                  <span className={styles.radioDesc}>
                    {t('activationModal.storageLocalDesc')}
                  </span>
                </div>
              </label>
              <label className={styles.radioOption}>
                <input
                  type="radio"
                  name="storagePreference"
                  value="database"
                  checked={storagePreference === 'database'}
                  onChange={() => setStoragePreference('database')}
                />
                <div className={styles.radioContent}>
                  <span className={styles.radioTitle}>
                    {t('activationModal.storageDatabaseTitle')}
                  </span>
                  <span className={styles.radioDesc}>
                    {t('activationModal.storageDatabaseDesc')}
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Actions */}
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={onClose}
              disabled={loading}
            >
              {t('activationModal.cancel')}
            </button>
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={!canSubmit}
            >
              {loading ? t('activationModal.submitting') : t('activationModal.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ActivationModal
