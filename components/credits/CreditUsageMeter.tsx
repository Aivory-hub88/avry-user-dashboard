'use client'

/**
 * Intelligence Credit usage meter — the plan's monthly limit as a bar with
 * its reset date, and below it the extra (top-up) credits, which are spent
 * only once the monthly limit is used up and never expire.
 *
 * Reads `GET /api/v1/credits` (lib/agentProfiles.ts `getCredits`). Renders
 * nothing until the status arrives, and nothing for unlimited accounts
 * beyond a single line saying so.
 */

import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { getCredits, type CreditStatus } from '@/lib/agentProfiles'
import { planLabel, TOKENS_PER_CREDIT } from '@/lib/tiers'

/** Fraction of the monthly limit used at which the bar turns amber. */
const WARN_AT = 0.85

function compactTokens(n: number, locale: string): string {
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

export function useCreditStatus(): CreditStatus | null {
  const [credits, setCredits] = useState<CreditStatus | null>(null)
  useEffect(() => {
    let cancelled = false
    getCredits()
      .then((status) => {
        if (!cancelled) setCredits(status)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
  return credits
}

export default function CreditUsageMeter({
  credits,
  onTopUp,
  className = '',
}: {
  credits: CreditStatus
  onTopUp?: () => void
  className?: string
}) {
  const t = useTranslations('credits')
  const locale = useLocale()
  const num = (n: number) => n.toLocaleString(locale)

  if (credits.unlimited) {
    return (
      <div className={`rounded-2xl border border-white/[0.08] bg-[#262624] p-5 ${className}`}>
        <p className="text-sm text-white/60">{t('unlimited')}</p>
      </div>
    )
  }

  const allowance = credits.allowance ?? 0
  const monthlyLeft = credits.monthly_balance ?? Math.min(credits.balance ?? 0, allowance)
  const extra = credits.extra_balance ?? Math.max(0, (credits.balance ?? 0) - allowance)
  const used = Math.max(0, allowance - monthlyLeft)
  const usedFraction = allowance > 0 ? Math.min(1, used / allowance) : 1
  const pct = Math.round(usedFraction * 100)
  // Share of the extra credits this period has drawn on, like a prepaid balance.
  const extraUsed = credits.extra_used_this_period ?? 0
  const extraPct = extraUsed + extra > 0 ? Math.round((extraUsed / (extraUsed + extra)) * 100) : 0
  const perCredit = credits.tokens_per_credit ?? TOKENS_PER_CREDIT
  const resets = credits.resets_at
    ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(`${credits.resets_at}T00:00:00`))
    : null
  // Red only when nothing is left at all; a spent month with extra credits
  // behind it is a warning, not an outage.
  const monthlyBar =
    usedFraction >= 1 && extra <= 0 ? 'bg-red-400' : usedFraction >= WARN_AT ? 'bg-amber-400' : 'bg-[#4a86e8]'

  return (
    <div className={`rounded-2xl border border-white/[0.08] bg-[#262624] p-5 text-white ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[15px] text-white/50">
          {t('title')} · {planLabel(credits.tier)}
        </p>
        {onTopUp && (
          <button
            type="button"
            onClick={onTopUp}
            className="text-[15px] text-white/90 hover:text-white transition-colors"
          >
            {t('topUp')} →
          </button>
        )}
      </div>

      <div className="mt-5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[15px]">{t('monthlyLimit')}</span>
          <span className="text-[15px] text-white/50 tabular-nums">
            {resets && <>{t('resetsOn', { date: resets })}&nbsp;&nbsp;</>}
            {pct}%
          </span>
        </div>
        <div
          className="mt-2 h-1.5 w-full rounded-full bg-white/[0.08] overflow-hidden"
          role="progressbar"
          aria-label={t('monthlyLimit')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <div className={`h-full rounded-full ${monthlyBar} transition-[width] duration-500`} style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-xs text-white/40 tabular-nums">
          {t('monthlyDetail', { used: num(used), allowance: num(allowance) })}
          {credits.tokens_used_this_period ? (
            <> · {t('tokensUsed', { tokens: compactTokens(credits.tokens_used_this_period, locale) })}</>
          ) : null}
        </p>
      </div>

      <div className="mt-6">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[15px] inline-flex items-center gap-2">
            {t('extraCredits')}
            <span
              title={t('extraHelp')}
              aria-label={t('extraHelp')}
              className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full border border-white/40 text-[11px] text-white/60 cursor-help"
            >
              ?
            </span>
          </span>
          <span className="text-[15px] text-white/50 tabular-nums">{t('extraLeft', { credits: num(extra) })}</span>
        </div>
        <div
          className="mt-2 h-1.5 w-full rounded-full bg-white/[0.08] overflow-hidden"
          role="progressbar"
          aria-label={t('extraCredits')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={extraPct}
        >
          <div className="h-full rounded-full bg-[#4a86e8] transition-[width] duration-500" style={{ width: `${extraPct}%` }} />
        </div>
        <p className="mt-2 text-xs text-white/40">
          {extra > 0 ? (usedFraction >= 1 ? t('extraInUse') : t('extraWaiting')) : t('extraNone')}
        </p>
      </div>

      <p className="mt-5 border-t border-white/[0.06] pt-3 text-xs text-white/40">
        {t('perCredit', {
          peak: compactTokens(perCredit.peak, locale),
          offpeak: compactTokens(perCredit.offpeak, locale),
        })}
      </p>
    </div>
  )
}
