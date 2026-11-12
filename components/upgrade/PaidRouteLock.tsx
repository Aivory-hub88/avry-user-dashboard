'use client'

/**
 * Free preview lock for whole modules (Agents, Blueprint, Roadmap,
 * Integrations, ...). A free account still sees the real page, blurred and
 * inert, under a "paid plans only" card, so the dashboard looks like the paid
 * product. Nothing here is a security boundary: the page's own API calls are
 * refused by the server for an account without a plan.
 */

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { usePlanAccess } from '@/hooks/usePlanAccess'
import { LOCKED_FEATURE_NAMES, lockedPrefixFor } from '@/lib/freePreview'
import { requestUpgrade } from '@/lib/planAccess'
import { LockIcon } from './UpgradeModal'

export default function PaidRouteLock({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { paid } = usePlanAccess()
  const prefix = lockedPrefixFor(pathname)

  if (paid !== false || !prefix) return <>{children}</>

  const name = LOCKED_FEATURE_NAMES[prefix] ?? 'This feature'
  return (
    <div className="relative flex-1 min-h-full">
      <div
        aria-hidden="true"
        // `inert` keeps the preview out of tab order and pointer events.
        inert
        className="pointer-events-none select-none blur-[3px] opacity-60 saturate-50 h-full"
      >
        {children}
      </div>
      <div className="absolute inset-0 flex items-start justify-center px-4 pt-[18vh]">
        <div className="w-full max-w-[380px] rounded-2xl border border-white/10 bg-[var(--bg-elevated)]/95 p-6 text-center shadow-2xl backdrop-blur">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-zinc-300">
            <LockIcon className="h-4 w-4" />
          </div>
          <h2 className="text-base font-semibold text-zinc-100">Available on paid plans</h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            Upgrade to the Operational plan to unlock {name}.
          </p>
          <button
            type="button"
            onClick={() => requestUpgrade({ feature: name })}
            className="mt-5 w-full rounded-lg bg-zinc-100 px-4 py-2.5 text-sm font-semibold text-zinc-900 transition-colors hover:bg-white"
          >
            See what&apos;s included
          </button>
        </div>
      </div>
    </div>
  )
}
