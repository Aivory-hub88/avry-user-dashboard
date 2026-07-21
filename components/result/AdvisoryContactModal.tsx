'use client'

import React, { useEffect, useState } from 'react'
import styles from './AdvisoryContactModal.module.css'

export interface AdvisoryContactModalProps {
  open: boolean
  onClose: () => void
  /** Pre-fills the Company field with the report's company name, if known. */
  companyName?: string
}

/**
 * Submits via FormSubmit's AJAX endpoint (https://formsubmit.co) — a
 * third-party form-relay service that emails the payload to
 * advisory@aivory.uk with no backend route or API key on our side.
 *
 * IMPORTANT one-time step: the FIRST submission to a not-yet-verified
 * address only triggers a confirmation email from FormSubmit to
 * advisory@aivory.uk — the mailbox owner must click "Activate Form" in
 * that email before any real submission is delivered. Subsequent
 * submissions go straight through.
 *
 * Falls back to a pre-filled mailto: draft (same mechanism as the landing
 * site's /contact form) if the network request fails, so the CTA still
 * works even if FormSubmit is unreachable or not yet activated.
 */
const FORMSUBMIT_ENDPOINT = 'https://formsubmit.co/ajax/advisory@aivory.uk'

type SubmitState = 'idle' | 'submitting' | 'sent' | 'error'

export default function AdvisoryContactModal({ open, onClose, companyName }: AdvisoryContactModalProps) {
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [honey, setHoney] = useState('') // honeypot — real users never fill this
  const [state, setState] = useState<SubmitState>('idle')

  useEffect(() => {
    if (open) setCompany((c) => c || companyName || '')
  }, [open, companyName])

  useEffect(() => {
    if (!open) setState('idle')
  }, [open])

  if (!open) return null

  const canSubmit = name.trim().length > 0 && email.trim().length > 0 && state !== 'submitting'

  const mailtoFallback = () => {
    const subject = `Advisory session request — ${company.trim() || name.trim()}`
    const body =
      `Name: ${name.trim()}\n` +
      `Company: ${company.trim()}\n` +
      `Email: ${email.trim()}\n\n` +
      `${message.trim() || 'I would like to schedule a session to walk through my Business Operations Assessment.'}`
    window.location.href = `mailto:advisory@aivory.uk?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    if (honey.trim().length > 0) return // bot filled the honeypot — silently drop

    setState('submitting')
    try {
      const res = await fetch(FORMSUBMIT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          company: company.trim(),
          email: email.trim(),
          message: message.trim() || 'I would like to schedule a session to walk through my Business Operations Assessment.',
          _subject: `Advisory session request — ${company.trim() || name.trim()}`,
          _captcha: 'false',
          _template: 'table',
        }),
      })
      if (!res.ok) throw new Error(`FormSubmit responded ${res.status}`)
      setState('sent')
    } catch (err) {
      console.error('[AdvisoryContactModal] FormSubmit request failed, falling back to mailto:', err)
      setState('error')
      mailtoFallback()
    }
  }

  if (state === 'sent') {
    return (
      <div className={styles.overlay} onClick={onClose}>
        <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
          <div className={styles.form}>
            <div className={styles.header}>
              <h2 className={styles.title}>Request sent</h2>
              <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
                ✕
              </button>
            </div>
            <p className={styles.intro}>
              Thanks, {name.trim().split(' ')[0]} — we&apos;ve received your request and will follow up at{' '}
              {email.trim()} to schedule your session.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.header}>
            <h2 className={styles.title}>Talk to our advisory team</h2>
            <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
          <p className={styles.intro}>
            Tell us a little about yourself and we&apos;ll follow up to schedule a session
            debriefing your report and aligning it with your roadmap.
          </p>

          {/* Honeypot — hidden from real users via CSS, bots tend to fill every field */}
          <input
            type="text"
            name="_honey"
            value={honey}
            onChange={(e) => setHoney(e.target.value)}
            className={styles.honeypot}
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
          />

          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="advisory-name">Name *</label>
            <input
              id="advisory-name"
              className={styles.input}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. John Doe"
              required
            />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="advisory-company">Company</label>
            <input
              id="advisory-company"
              className={styles.input}
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="e.g. Acme Logistics"
            />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="advisory-email">Email *</label>
            <input
              id="advisory-email"
              className={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
            />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="advisory-message">Message</label>
            <textarea
              id="advisory-message"
              className={styles.textarea}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What would you like to cover in the session?"
              rows={3}
            />
          </div>

          {state === 'error' && (
            <p className={styles.errorNote}>
              Couldn&apos;t reach our form service — opening your email client instead.
            </p>
          )}

          <button type="submit" className={styles.submitBtn} disabled={!canSubmit}>
            {state === 'submitting' ? 'Sending…' : 'Send to our advisory team'}
          </button>
        </form>
      </div>
    </div>
  )
}
