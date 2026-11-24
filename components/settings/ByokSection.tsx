'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  BYOK_PROVIDERS,
  ByokKey,
  ByokProvider,
  deleteByokKey,
  listByokKeys,
  saveByokKey,
  testByokKey,
} from '@/lib/byok'

type Notice = { kind: 'error' | 'ok'; text: string }

export function ByokSection() {
  const [keys, setKeys] = useState<ByokKey[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [editing, setEditing] = useState<ByokProvider | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setKeys(await listByokKeys())
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Failed to load keys' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const run = async (id: string, fn: () => Promise<void>) => {
    setBusy(id)
    setNotice(null)
    try {
      await fn()
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Something went wrong' })
    } finally {
      setBusy(null)
    }
  }

  const handleSave = (provider: ByokProvider) =>
    run(`save:${provider}`, async () => {
      await saveByokKey(provider, draft.trim())
      setDraft('')
      setEditing(null)
      setNotice({ kind: 'ok', text: 'Key verified and saved.' })
      await load()
    })

  const handleTest = (provider: ByokProvider) =>
    run(`test:${provider}`, async () => {
      const r = await testByokKey(provider)
      setNotice(r.ok ? { kind: 'ok', text: 'Key is working.' } : { kind: 'error', text: r.reason || 'Key check failed' })
      await load()
    })

  const handleRemove = (provider: ByokProvider) =>
    run(`del:${provider}`, async () => {
      await deleteByokKey(provider)
      await load()
    })

  return (
    <div className="animate-in slide-in-from-bottom-2 fade-in duration-300">
      <h2 className="text-2xl font-semibold mb-8 pb-4 border-b border-white/5">
        API Keys (BYOK)
        <span className="block mt-1 text-[13px] font-normal text-white/60">
          Use your own model provider key. Requests that use it are billed to your provider account, so they don&apos;t use Aivory credits. Keys are verified when saved, stored encrypted, and never shown again.
        </span>
      </h2>

      {notice && (
        <div
          className={`mb-4 px-4 py-3 rounded-xl text-[12px] border ${
            notice.kind === 'error'
              ? 'bg-red-500/10 border-red-500/20 text-red-300/90'
              : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300/90'
          }`}
        >
          {notice.text}
        </div>
      )}

      {BYOK_PROVIDERS.map((p) => {
        const saved = keys.find((k) => k.provider === p.id)
        const isEditing = editing === p.id
        return (
          <div key={p.id} className="mb-6 bg-white/5 border border-white/10 rounded-xl p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold">{p.label}</h3>
                <p className="text-[12px] text-white/50 mt-0.5">{p.help}</p>
              </div>
              {!isEditing && (
                <button
                  onClick={() => { setEditing(p.id); setDraft(''); setNotice(null) }}
                  className="px-4 py-2 text-[13px] font-medium bg-accent/20 hover:bg-accent/30 text-[var(--color-accent-text)] rounded-md border border-accent/30 transition-colors shrink-0"
                >
                  {saved ? 'Replace key' : 'Add key'}
                </button>
              )}
            </div>

            {saved && !isEditing && (
              <div className="mt-4 flex items-center justify-between gap-4 text-[13px]">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-white/80">{saved.key_hint}</span>
                  <span className={saved.status === 'active' ? 'text-emerald-300/90' : 'text-red-300/90'}>
                    {saved.status === 'active' ? 'Active' : 'Rejected by provider'}
                  </span>
                </div>
                <div className="flex gap-4">
                  <button
                    onClick={() => handleTest(p.id)}
                    disabled={busy !== null}
                    className="text-white/60 hover:text-white transition-colors disabled:opacity-50"
                  >
                    {busy === `test:${p.id}` ? 'Testing…' : 'Test'}
                  </button>
                  <button
                    onClick={() => handleRemove(p.id)}
                    disabled={busy !== null}
                    className="text-red-300/80 hover:text-red-300 transition-colors disabled:opacity-50"
                  >
                    {busy === `del:${p.id}` ? 'Removing…' : 'Remove'}
                  </button>
                </div>
              </div>
            )}

            {isEditing && (
              <div className="mt-4">
                <input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={p.placeholder}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-white/[0.04] border border-white/10 text-white/90 text-[13px] font-mono placeholder-white/25 focus:outline-none focus:border-accent/40 transition-colors mb-4"
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => handleSave(p.id)}
                    disabled={busy !== null || draft.trim().length < 20}
                    className="px-4 py-2.5 rounded-lg bg-accent/20 hover:bg-accent/30 text-[var(--color-accent-text)] text-[13px] font-medium transition-all border border-accent/30 disabled:opacity-50"
                  >
                    {busy === `save:${p.id}` ? 'Verifying…' : 'Verify and save'}
                  </button>
                  <button
                    onClick={() => { setEditing(null); setDraft('') }}
                    className="px-4 py-2.5 rounded-lg text-white/50 hover:text-white text-[13px] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {loading && <p className="text-white/40 text-[12px]">Loading…</p>}
    </div>
  )
}
