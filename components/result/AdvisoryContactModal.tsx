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
 * Same mechanism as the landing site's /contact form (frontend-nextjs):
 * this dashboard has no server-side email-sending route, so submitting
 * builds a pre-filled mailto: draft and hands off to the visitor's mail
 * client — it does not send anything itself. Routed to advisory@aivory.uk
 * (the landing contact form uses hello@aivory.uk).
 */
export default function AdvisoryContactModal({ open, onClose, companyName }: AdvisoryContactModalProps) {
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (open) setCompany((c) => c || companyName || '')
  }, [open, companyName])

  if (!open) return null

  const canSubmit = name.trim().length > 0 && email.trim().length > 0

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    const subject = `Advisory session request — ${company.trim() || name.trim()}`
    const body =
      `Name: ${name.trim()}\n` +
      `Company: ${company.trim()}\n` +
      `Email: ${email.trim()}\n\n` +
      `${message.trim() || 'I would like to schedule a session to walk through my Business Operations Assessment.'}`
    window.location.href = `mailto:advisory@aivory.uk?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    onClose()
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

          <button type="submit" className={styles.submitBtn} disabled={!canSubmit}>
            Open email to advisory@aivory.uk
          </button>
        </form>
      </div>
    </div>
  )
}
