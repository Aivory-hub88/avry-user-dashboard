'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Passkey,
  PasskeyCancelledError,
  addPasskey,
  listPasskeys,
  passkeysSupported,
  removePasskey,
} from '@/lib/passkeys'

type Notice = { kind: 'error' | 'ok'; text: string }

function deviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Passkey'
  const ua = navigator.userAgent
  const os = /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'This device'
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : ''
  return browser ? `${os} · ${browser}` : os
}

function when(iso: string | null): string {
  if (!iso) return 'never'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? 'never' : d.toLocaleDateString()
}

export function PasskeysSection() {
  const [supported, setSupported] = useState(false)
  const [passkeys, setPasskeys] = useState<Passkey[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)

  const load = useCallback(async () => {
    try {
      setPasskeys(await listPasskeys())
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Failed to load passkeys' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(passkeysSupported())
    load()
  }, [load])

  const add = async () => {
    setBusy(true)
    setNotice(null)
    try {
      await addPasskey(deviceLabel())
      await load()
      setNotice({ kind: 'ok', text: 'Passkey added. You can now sign in with it.' })
    } catch (err) {
      if (!(err instanceof PasskeyCancelledError)) {
        setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not add the passkey' })
      }
    } finally {
      setBusy(false)
    }
  }

  const remove = async (p: Passkey) => {
    if (!window.confirm(`Remove "${p.name}"? You will no longer be able to sign in with it.`)) return
    setBusy(true)
    setNotice(null)
    try {
      await removePasskey(p.id)
      await load()
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not remove the passkey' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mb-10">
      <h3 className="text-base font-semibold mb-1">Passkeys</h3>
      <p className="text-[13px] text-white/60 mb-4">
        Sign in with Face ID, Touch ID or your device PIN instead of typing a password. Your password keeps working.
      </p>

      {loading ? (
        <p className="text-[13px] text-white/40 py-3">Loading…</p>
      ) : (
        <ul className="mb-4">
          {passkeys.map((p) => (
            <li key={p.id} className="flex items-center justify-between py-3 border-b border-white/5">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{p.name}</p>
                <p className="text-[12px] text-white/50">
                  Added {when(p.created_at)} · last used {when(p.last_used_at)}
                </p>
              </div>
              <button
                onClick={() => remove(p)}
                disabled={busy}
                className="shrink-0 ml-4 px-3 py-1.5 text-[13px] font-medium border border-white/10 rounded-md hover:bg-white/5 transition-colors text-red-400 hover:text-red-300 disabled:opacity-40"
              >
                Remove
              </button>
            </li>
          ))}
          {passkeys.length === 0 && (
            <li className="text-[13px] text-white/40 py-3">No passkeys yet.</li>
          )}
        </ul>
      )}

      {notice && (
        <p className={`text-[13px] mb-3 ${notice.kind === 'error' ? 'text-red-400' : 'text-emerald-400'}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
          {notice.text}
        </p>
      )}

      {supported ? (
        <button
          onClick={add}
          disabled={busy}
          className="px-4 py-2 text-[13px] font-medium border border-white/10 rounded-md hover:bg-white/5 transition-colors disabled:opacity-40"
        >
          {busy ? 'Waiting for your device…' : 'Add a passkey'}
        </button>
      ) : (
        <p className="text-[13px] text-white/40">This browser does not support passkeys.</p>
      )}
    </div>
  )
}
