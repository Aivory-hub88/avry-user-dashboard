'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  BYOK_PROVIDERS,
  ByokKey,
  ByokProvider,
  ByokSettings,
  deleteByokKey,
  effectiveProvider,
  listByokKeys,
  saveByokKey,
  testByokKey,
  updateByokSettings,
} from '@/lib/byok'

// Deliberately neutral: no `accent` (sage) token and no brand colour here. The
// only colour is red, for a key the provider rejected or an error.

type Notice = { kind: 'error' | 'ok'; text: string }

const MONOGRAM: Record<ByokProvider, string> = {
  openrouter: 'OR',
  anthropic: 'A',
  openai: 'AI',
}

const LABEL: Record<ByokProvider, string> = Object.fromEntries(
  BYOK_PROVIDERS.map((p) => [p.id, p.label])
) as Record<ByokProvider, string>

const DEFAULT_SETTINGS: ByokSettings = { enabled: true, preferred_provider: null }

export function ByokSection() {
  const [keys, setKeys] = useState<ByokKey[]>([])
  const [settings, setSettings] = useState<ByokSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [editing, setEditing] = useState<ByokProvider | null>(null)
  const [draft, setDraft] = useState('')
  const [reveal, setReveal] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    try {
      const overview = await listByokKeys()
      setKeys(overview.keys)
      setSettings(overview.settings)
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

  // Success messages fade on their own; errors stay until the next action.
  useEffect(() => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    if (notice?.kind === 'ok') {
      noticeTimer.current = setTimeout(() => setNotice(null), 4000)
    }
    return () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current)
    }
  }, [notice])

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

  // Settings flip instantly and roll back if the server says no, so the switch
  // never feels laggy but never lies about what's saved either.
  const changeSettings = async (patch: Partial<ByokSettings>) => {
    const previous = settings
    setSettings({ ...settings, ...patch })
    setNotice(null)
    try {
      setSettings(await updateByokSettings(patch))
    } catch (err) {
      setSettings(previous)
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not save that change' })
    }
  }

  const openEditor = (provider: ByokProvider) => {
    setEditing(provider)
    setDraft('')
    setReveal(false)
    setNotice(null)
  }
  const closeEditor = () => {
    setEditing(null)
    setDraft('')
    setReveal(false)
  }

  const handleSave = (provider: ByokProvider) =>
    run(`save:${provider}`, async () => {
      await saveByokKey(provider, draft.trim())
      closeEditor()
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
      setNotice({ kind: 'ok', text: 'Key removed.' })
      await load()
    })

  const connected = keys.filter((k) => k.status === 'active').map((k) => k.provider)
  const hasKey = connected.length > 0
  const inUse = effectiveProvider(keys, settings)
  const off = !settings.enabled

  return (
    <div className="animate-in slide-in-from-bottom-2 fade-in duration-300">
      <header className="mb-6">
        <h2 className="text-[22px] font-semibold tracking-tight">API Keys</h2>
        <p className="mt-1.5 max-w-[56ch] text-[13px] leading-relaxed text-white/50">
          Bring your own model provider key and pay your provider directly instead of using Aivory credits.
        </p>
      </header>

      {/* Reserved height so a message appearing doesn't shove the page around. */}
      <div className="mb-3 min-h-[40px]" aria-live="polite">
        {notice && (
          <div
            className={`flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-[12.5px] animate-in fade-in slide-in-from-top-1 duration-200 ${
              notice.kind === 'error'
                ? 'bg-red-500/[0.08] text-red-300/90 ring-1 ring-inset ring-red-400/15'
                : 'bg-white/[0.05] text-white/80 ring-1 ring-inset ring-white/10'
            }`}
          >
            <span className="size-1.5 shrink-0 rounded-full bg-current" />
            {notice.text}
          </div>
        )}
      </div>

      {/* Master control: the one decision most people come here to make. */}
      <section className="mb-8 divide-y divide-white/[0.06] rounded-2xl border border-white/[0.08] bg-white/[0.03]">
        <div className="flex items-center gap-4 p-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              <h3 className="text-[15px] font-medium text-white/90">Use my own API keys</h3>
              <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-white/50">Billed to you</span>
            </div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-white/45">
              {loading
                ? ' '
                : !hasKey
                  ? 'Add a key below to turn this on.'
                  : inUse === 'openrouter'
                    ? "Agent chats run on your OpenRouter key, so they don't use Aivory credits."
                    : inUse
                      ? `Your ${LABEL[inUse]} key covers chats on supported agents. Everything else still uses Aivory credits.`
                      : 'Switched off. Your keys are kept, and chats use Aivory credits.'}
            </p>
          </div>
          <Switch
            checked={settings.enabled && hasKey}
            disabled={loading || !hasKey}
            label="Use my own API keys"
            onChange={(v) => changeSettings({ enabled: v })}
          />
        </div>

        <div className="flex items-center gap-2.5 px-4 py-3 text-[12.5px]">
          <span
            className={`size-2 shrink-0 rounded-full transition-colors duration-200 ${
              inUse ? 'bg-white shadow-[0_0_0_3px_rgba(255,255,255,0.12)]' : 'bg-white/25'
            }`}
          />
          <span className="text-white/45">Chats currently use</span>
          <span className="font-medium text-white/80">
            {loading ? '…' : inUse ? `your ${LABEL[inUse]} key` : 'Aivory credits'}
          </span>
        </div>

        {connected.length > 1 && (
          <div className={`flex items-center gap-4 p-4 transition-opacity duration-200 ${off ? 'opacity-40' : ''}`}>
            <div className="min-w-0 flex-1">
              <h3 className="text-[14px] font-medium text-white/85">Primary provider</h3>
              <p className="mt-0.5 text-[12.5px] text-white/45">Which key chats use first when you have more than one.</p>
            </div>
            <Segmented
              disabled={off}
              value={settings.preferred_provider}
              onChange={(v) => changeSettings({ preferred_provider: v })}
              options={[
                { value: null, label: 'Auto' },
                ...connected.map((id) => ({ value: id as ByokProvider | null, label: LABEL[id] })),
              ]}
            />
          </div>
        )}
      </section>

      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[12px] font-medium uppercase tracking-[0.08em] text-white/35">Provider keys</h3>
        <span className="flex items-center gap-1.5 text-[12px] text-white/35">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          Encrypted, never shown again
        </span>
      </div>

      <div className={`space-y-3 transition-opacity duration-200 ${off && hasKey ? 'opacity-60' : ''}`}>
        {loading
          ? BYOK_PROVIDERS.map((p) => (
              <div key={p.id} className="h-[84px] animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.03]" />
            ))
          : BYOK_PROVIDERS.map((p) => {
              const saved = keys.find((k) => k.provider === p.id)
              const isEditing = editing === p.id
              const rejected = saved?.status === 'invalid'
              const primary = inUse === p.id
              return (
                <section
                  key={p.id}
                  className="group rounded-2xl border border-white/[0.08] bg-white/[0.03] transition-colors duration-150 hover:bg-white/[0.045]"
                >
                  <div className="flex items-center gap-4 p-4">
                    <div
                      aria-hidden
                      className="grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-b from-white/[0.10] to-white/[0.04] text-[13px] font-semibold tracking-tight text-white/80 ring-1 ring-inset ring-white/10"
                    >
                      {MONOGRAM[p.id]}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2.5">
                        <h3 className="text-[15px] font-medium text-white/90">{p.label}</h3>
                        {saved && (
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              rejected ? 'bg-red-500/10 text-red-300/90' : 'bg-white/[0.07] text-white/70'
                            }`}
                          >
                            <span className="size-1.5 rounded-full bg-current" />
                            {rejected ? 'Rejected' : primary ? 'In use' : 'Connected'}
                          </span>
                        )}
                      </div>
                      {saved ? (
                        <p className="mt-1 font-mono text-[12px] text-white/40">
                          <span className="tracking-[0.2em]">••••••••</span>
                          {saved.key_hint.replace('…', '')}
                        </p>
                      ) : (
                        <p className="mt-0.5 text-[12.5px] text-white/40">{p.help}</p>
                      )}
                    </div>

                    {!isEditing && (
                      <div className="flex shrink-0 items-center gap-1">
                        {saved ? (
                          <>
                            <GhostButton onClick={() => handleTest(p.id)} disabled={busy !== null}>
                              {busy === `test:${p.id}` ? 'Testing…' : 'Test'}
                            </GhostButton>
                            <GhostButton onClick={() => openEditor(p.id)} disabled={busy !== null}>
                              Replace
                            </GhostButton>
                            <GhostButton danger onClick={() => handleRemove(p.id)} disabled={busy !== null}>
                              {busy === `del:${p.id}` ? 'Removing…' : 'Remove'}
                            </GhostButton>
                          </>
                        ) : (
                          <button
                            onClick={() => openEditor(p.id)}
                            className="rounded-lg bg-white px-3.5 py-2 text-[13px] font-medium text-black transition-[transform,background-color] duration-150 hover:bg-white/90 active:scale-[0.97] motion-reduce:transition-none"
                          >
                            Add key
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Editor slides open in place: animating grid rows avoids a height jump. */}
                  <div
                    className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
                      isEditing ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                    }`}
                  >
                    <div className="overflow-hidden">
                      {isEditing && (
                        <form
                          className="border-t border-white/[0.06] px-4 pb-4 pt-4"
                          onSubmit={(e) => {
                            e.preventDefault()
                            if (draft.trim().length >= 20 && busy === null) handleSave(p.id)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') closeEditor()
                          }}
                        >
                          <label htmlFor={`byok-${p.id}`} className="mb-2 block text-[12px] font-medium text-white/60">
                            {p.label} API key
                          </label>
                          <div className="relative">
                            <input
                              id={`byok-${p.id}`}
                              autoFocus
                              type={reveal ? 'text' : 'password'}
                              autoComplete="off"
                              spellCheck={false}
                              value={draft}
                              onChange={(e) => setDraft(e.target.value)}
                              placeholder={p.placeholder}
                              className="w-full rounded-xl border border-white/10 bg-black/30 py-3 pl-3.5 pr-11 font-mono text-[13px] text-white/90 placeholder-white/25 outline-none transition-[border-color,box-shadow] duration-150 focus:border-white/30 focus:ring-4 focus:ring-white/[0.06]"
                            />
                            <button
                              type="button"
                              onClick={() => setReveal((v) => !v)}
                              aria-label={reveal ? 'Hide key' : 'Show key'}
                              className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-white/40 transition-colors hover:bg-white/5 hover:text-white/70"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                {reveal ? (
                                  <>
                                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                                    <line x1="1" y1="1" x2="23" y2="23" />
                                  </>
                                ) : (
                                  <>
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                    <circle cx="12" cy="12" r="3" />
                                  </>
                                )}
                              </svg>
                            </button>
                          </div>
                          <p className="mt-2 text-[12px] text-white/35">
                            Starts with <span className="font-mono text-white/50">{p.placeholder.replace('…', '')}</span>. We check it with {p.label} before saving.
                          </p>
                          <div className="mt-4 flex items-center gap-2">
                            <button
                              type="submit"
                              disabled={busy !== null || draft.trim().length < 20}
                              className="rounded-lg bg-white px-4 py-2 text-[13px] font-medium text-black transition-[transform,background-color,opacity] duration-150 hover:bg-white/90 active:scale-[0.97] disabled:opacity-40 disabled:hover:bg-white disabled:active:scale-100 motion-reduce:transition-none"
                            >
                              {busy === `save:${p.id}` ? 'Verifying…' : 'Verify and save'}
                            </button>
                            <GhostButton type="button" onClick={closeEditor}>
                              Cancel
                            </GhostButton>
                          </div>
                        </form>
                      )}
                    </div>
                  </div>
                </section>
              )
            })}
      </div>
    </div>
  )
}

/** iOS-style switch. White when on, so it reads as state, not brand. */
function Switch({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean
  disabled?: boolean
  label: string
  onChange: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-[26px] w-[46px] shrink-0 rounded-full outline-none transition-colors duration-200 focus-visible:ring-4 focus-visible:ring-white/10 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none ${
        checked ? 'bg-white' : 'bg-white/15'
      }`}
    >
      <span
        className={`absolute left-[3px] top-[3px] size-5 rounded-full shadow-sm transition-[transform,background-color] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none ${
          checked ? 'translate-x-5 bg-black' : 'translate-x-0 bg-white/80'
        }`}
      />
    </button>
  )
}

function Segmented<T extends string | null>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (next: T) => void
  disabled?: boolean
}) {
  return (
    <div role="radiogroup" className="inline-flex shrink-0 rounded-xl bg-black/30 p-1 ring-1 ring-inset ring-white/[0.06]">
      {options.map((o) => {
        const selected = o.value === value
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={`rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-[background-color,color] duration-150 disabled:cursor-not-allowed motion-reduce:transition-none ${
              selected ? 'bg-white/[0.12] text-white' : 'text-white/50 hover:text-white/80'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function GhostButton({
  children,
  danger,
  type = 'button',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean }) {
  return (
    <button
      type={type}
      {...rest}
      className={`rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium transition-[background-color,color,transform] duration-150 active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100 motion-reduce:transition-none ${
        danger
          ? 'text-red-300/70 hover:bg-red-500/10 hover:text-red-300'
          : 'text-white/55 hover:bg-white/[0.06] hover:text-white/90'
      }`}
    >
      {children}
    </button>
  )
}
