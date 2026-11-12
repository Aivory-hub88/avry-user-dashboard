'use client'

/**
 * The one upgrade prompt. Opens on `requestUpgrade()` (lib/planAccess.ts)
 * from anywhere: the AI Console on send, a 402 UPGRADE_REQUIRED from any
 * API, a locked page's button. Mounted once in the root layout.
 */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { UPGRADE_EVENT, type UpgradeRequest } from '@/lib/planAccess'
import { UPGRADE_PATH } from '@/lib/freePreview'
import { TIER_CREDIT_ALLOWANCE, TIER_MONTHLY_PRICE_USD } from '@/lib/tiers'

const INCLUDED = [
  'AI Console and AI Agents',
  'Workflow Copilot and automations',
  'Integrations with the tools you already use',
  `${TIER_CREDIT_ALLOWANCE.operational.toLocaleString('en-US')} Intelligence Credits every month`,
]

export default function UpgradeModal() {
  const [request, setRequest] = useState<UpgradeRequest | null>(null)
  const cta = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    const onRequest = (e: Event) => setRequest((e as CustomEvent<UpgradeRequest>).detail ?? {})
    window.addEventListener(UPGRADE_EVENT, onRequest)
    return () => window.removeEventListener(UPGRADE_EVENT, onRequest)
  }, [])

  useEffect(() => {
    if (!request) return
    cta.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRequest(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [request])

  if (!request) return null

  const title = request.feature ? `Unlock ${request.feature}` : 'Upgrade to keep going'
  const body =
    request.message ||
    'Your free account includes the free AI readiness analysis. Upgrade to the Operational plan to unlock the Deep Diagnostic, workflows, AI agents and everything else.'

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setRequest(null)
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-title"
        className="w-full max-w-[420px] rounded-2xl border border-white/10 bg-[var(--bg-elevated)] p-6 shadow-2xl"
      >
        <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-xs text-zinc-300">
          <LockIcon /> Paid feature
        </div>
        <h2 id="upgrade-title" className="text-lg font-semibold text-zinc-100">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">{body}</p>

        <ul className="mt-5 space-y-2">
          {INCLUDED.map((line) => (
            <li key={line} className="flex items-start gap-2 text-sm text-zinc-300">
              <CheckIcon />
              <span>{line}</span>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex items-center gap-2">
          <Link
            ref={cta}
            href={UPGRADE_PATH}
            onClick={() => setRequest(null)}
            className="flex-1 rounded-lg bg-zinc-100 px-4 py-2.5 text-center text-sm font-semibold text-zinc-900 transition-colors hover:bg-white"
          >
            Upgrade to Operational · ${TIER_MONTHLY_PRICE_USD.operational}/mo
          </Link>
          <button
            type="button"
            onClick={() => setRequest(null)}
            className="rounded-lg px-4 py-2.5 text-sm text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-100"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}

export function LockIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
