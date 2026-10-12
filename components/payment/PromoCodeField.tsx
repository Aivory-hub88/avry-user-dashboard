'use client'

import { useState } from 'react'
import { AuthManager } from '@/lib/authManager'
import { SERVICES } from '@/config/services'

interface PromoCodeFieldProps {
  /** The code currently applied to this checkout ('' when none). */
  value: string
  onChange: (code: string) => void
  /**
   * Products this checkout can buy. A code is accepted if it works on at least
   * one of them; the payments service re-checks it against the product actually
   * purchased, so this is only about giving feedback before the customer pays.
   */
  products: string[]
  disabled?: boolean
}

type Status =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'error'; message: string }

/**
 * A "have a promo code?" box. The discount is never computed here: it only asks
 * the payments service whether the code is usable, and the amount charged is
 * decided by the service when the order is created.
 */
export default function PromoCodeField({ value, onChange, products, disabled }: PromoCodeFieldProps) {
  const [draft, setDraft] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  const apply = async () => {
    const code = draft.trim().toUpperCase()
    if (!code) return
    setStatus({ kind: 'checking' })

    let lastError = 'That promo code isn’t valid.'
    try {
      for (const product of products) {
        const res = await AuthManager.authenticatedFetch(
          `${SERVICES.PAYMENTS}/api/v1/payments/promo/validate`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, product }),
          }
        )
        const data = await res.json().catch(() => ({}))
        if (data?.valid) {
          onChange(code)
          setDraft('')
          setStatus({ kind: 'idle' })
          return
        }
        if (data?.error) lastError = data.error
      }
    } catch {
      lastError = 'Could not check the promo code. Try again.'
    }
    setStatus({ kind: 'error', message: lastError })
  }

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-accent/40 bg-accent/[0.08] px-4 py-2.5">
        <span className="text-sm text-gray-200">
          Promo code <span className="font-mono font-medium text-white">{value}</span> will be applied at checkout
        </span>
        <button
          type="button"
          onClick={() => onChange('')}
          disabled={disabled}
          className="text-xs text-gray-400 underline-offset-2 hover:text-white hover:underline disabled:opacity-50"
        >
          Remove
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value.toUpperCase())
            if (status.kind === 'error') setStatus({ kind: 'idle' })
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void apply()
            }
          }}
          placeholder="Promo code"
          aria-label="Promo code"
          maxLength={32}
          disabled={disabled || status.kind === 'checking'}
          className="flex-1 rounded-lg border border-white/[0.07] bg-white/[0.05] px-3 py-2 font-mono text-sm text-white placeholder-gray-500 focus:border-accent focus:outline-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => void apply()}
          disabled={disabled || !draft.trim() || status.kind === 'checking'}
          className="rounded-lg bg-white/[0.05] px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status.kind === 'checking' ? 'Checking…' : 'Apply'}
        </button>
      </div>
      {status.kind === 'error' && <p className="mt-2 text-xs text-red-300">{status.message}</p>}
    </div>
  )
}
