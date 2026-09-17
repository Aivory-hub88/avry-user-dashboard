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
import { getMarketingUrl } from '@/lib/config'

const AUTO_NAV_SECONDS = 8

function loginUrl(): string {
  return `${getMarketingUrl()}/login`
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

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="session-expired-title"
    >
      <div className="w-full max-w-[420px] rounded-2xl border border-amber-400/20 bg-surface-1 px-6 py-6 text-left shadow-2xl">
        <div className="mb-1 inline-block rounded-full bg-amber-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-300/90">
          {expired ? 'Sesi berakhir' : 'Login diperlukan'}
        </div>
        <h2 id="session-expired-title" className="mt-3 text-lg font-semibold text-white">
          {expired ? 'Sesi Anda telah berakhir' : 'Silakan login kembali'}
        </h2>
        <p className="mt-2 text-sm font-light leading-relaxed text-white/65">
          {expired
            ? 'Sesi login Anda sudah kedaluwarsa dan tidak bisa diperpanjang otomatis. Login kembali untuk melanjutkan — chat dan data Anda tetap tersimpan.'
            : 'Anda belum login atau sesi tidak ditemukan. Login untuk mengakses dashboard.'}
        </p>
        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={goLogin}
            className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-on-accent transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Login kembali
          </button>
          {!autoNavigate && (
            <button
              onClick={() => setVisible(false)}
              className="text-sm font-medium text-white/45 underline underline-offset-2 transition-colors hover:text-white/75"
            >
              Nanti saja
            </button>
          )}
        </div>
        {autoNavigate && (
          <p className="mt-4 text-xs font-light text-white/40">
            Mengalihkan ke halaman login dalam {countdown} detik…
          </p>
        )}
      </div>
    </div>
  )
}
