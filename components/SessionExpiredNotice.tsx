'use client'

/**
 * "Sesi telah berakhir" notice — the missing session-expired notification.
 *
 * Two entry paths, one modal:
 *  - Mid-use death: backend explicitly rejects the refresh token and
 *    `deployAuth` logs out with reason 'expired', firing
 *    SESSION_EXPIRED_EVENT. The modal appears over the current page (no
 *    forced navigation — unsent input stays put) with a Login button.
 *  - Gate denial: DashboardEntryGate renders this with `autoNavigate` when
 *    access resolves to denied+sign-in. Same copy, plus an 8s countdown
 *    that performs the single redirect the hook used to fire silently.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { SESSION_EXPIRED_EVENT, readSessionEndReason, clearSessionEndReason } from '@/lib/auth'
import { signInUrlHere } from '@/lib/signIn'
import { getInitialLocale } from '@/hooks/useLocale'

const AUTO_NAV_SECONDS = 8

// Read straight from the stored locale: the entry gate renders this outside
// the dashboard shell, and the notice only shows after mount anyway.
const COPY = {
  en: {
    expiredTitle: 'Your session has ended',
    expiredBody: 'Sign in again to continue. Your chats and data are saved.',
    expiredCta: 'Sign in again',
    signInTitle: 'Please sign in',
    signInBody: 'Sign in to open your dashboard.',
    signInCta: 'Sign in',
    later: 'Not now',
    redirect: (n: number) => `Redirecting in ${n} ${n === 1 ? 'second' : 'seconds'}`,
  },
  id: {
    expiredTitle: 'Sesi Anda telah berakhir',
    expiredBody: 'Login lagi untuk melanjutkan. Chat dan data Anda tetap tersimpan.',
    expiredCta: 'Login kembali',
    signInTitle: 'Silakan login dulu',
    signInBody: 'Login untuk membuka dashboard Anda.',
    signInCta: 'Login',
    later: 'Nanti saja',
    redirect: (n: number) => `Mengalihkan dalam ${n} detik`,
  },
} as const

/** Landing /login with `?next=` back to this page (lib/signIn). */
function loginUrl(): string {
  return signInUrlHere()
}

export default function SessionExpiredNotice({ autoNavigate = false }: { autoNavigate?: boolean }) {
  const [visible, setVisible] = useState(autoNavigate)
  const [expired, setExpired] = useState(autoNavigate ? readSessionEndReason() === 'expired' : false)
  const [countdown, setCountdown] = useState(AUTO_NAV_SECONDS)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const goLogin = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    clearSessionEndReason()
    window.location.href = loginUrl()
  }, [])

  useEffect(() => {
    const onExpired = () => {
      setExpired(readSessionEndReason() === 'expired')
      setVisible(true)
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired)
  }, [])

  useEffect(() => {
    if (!visible || !autoNavigate) return
    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          if (timerRef.current) clearInterval(timerRef.current)
          goLogin()
          return 0
        }
        return c - 1
      })
    }, 1000)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [visible, autoNavigate, goLogin])

  if (!visible) return null
  const t = COPY[getInitialLocale()]

  return (
    <div
      className="session-backdrop-in fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4 backdrop-blur-md"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="session-expired-title"
      aria-describedby="session-expired-body"
    >
      <div
        ref={(el) => el?.focus({ preventScroll: true })}
        tabIndex={-1}
        className="session-card-in w-full outline-none max-w-[360px] rounded-3xl border border-white/[0.08] bg-[#151517] p-7 text-center shadow-[0_24px_80px_-12px_rgba(0,0,0,0.7)]">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-white/[0.06] ring-1 ring-white/[0.08]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-white/80" aria-hidden>
            <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
            <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
          </svg>
        </div>
        <h2 id="session-expired-title" className="mt-5 text-[17px] font-semibold tracking-[-0.01em] text-white">
          {expired ? t.expiredTitle : t.signInTitle}
        </h2>
        <p id="session-expired-body" className="mx-auto mt-2 max-w-[280px] text-[13.5px] leading-relaxed text-white/50">
          {expired ? t.expiredBody : t.signInBody}
        </p>
        <button
          type="button"
          onClick={goLogin}
          className="mt-6 w-full rounded-full bg-white py-2.5 text-[14px] font-semibold text-black transition-[background-color,transform] duration-150 hover:bg-white/90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 focus-visible:ring-offset-2 focus-visible:ring-offset-[#151517]"
        >
          {expired ? t.expiredCta : t.signInCta}
        </button>
        {autoNavigate ? (
          <div className="mt-4 text-[12px] text-white/35" aria-live="polite">
            {t.redirect(countdown)}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setVisible(false)}
            className="mt-2 w-full rounded-full py-2.5 text-[13px] font-medium text-white/45 transition-colors hover:bg-white/[0.04] hover:text-white/75"
          >
            {t.later}
          </button>
        )}
      </div>
    </div>
  )
}
