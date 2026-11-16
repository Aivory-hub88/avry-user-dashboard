"use client"

/**
 * WhatsApp connection panel (inside the CRM's side drawer): shows the Aivory
 * number when the account has it, or lets a customer connect their own account
 * with the provider of their choice. Text lives in span/div only (see CrmApp).
 */
import { useEffect, useState } from "react"
import { Button, fieldClass } from "@/components/requests/requestUi"
import { PROVIDERS, providerMeta } from "@/lib/whatsapp/providerMeta"
import type { ProviderId } from "@/lib/whatsapp/types"
import { waApi, type ReplyMode, type WaSettings, type WaStatus } from "@/lib/whatsappClient"

export default function WhatsappSettings({ status, onChanged }: { status: WaStatus | null; onChanged: () => void }) {
  const [provider, setProvider] = useState<ProviderId>("kapso")
  const [values, setValues] = useState<Record<string, string>>({})
  const [display, setDisplay] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [setup, setSetup] = useState<string[]>([])
  const meta = providerMeta(provider) ?? PROVIDERS[0]
  const ready = meta.fields.every((f) => f.optional || (values[f.key] ?? "").trim() !== "")
  const [settings, setSettings] = useState<WaSettings | null>(null)
  const [confirmAuto, setConfirmAuto] = useState(false)
  const connected = !!status?.connected
  useEffect(() => {
    if (!connected) return
    let alive = true
    waApi.settings().then(
      (s) => alive && setSettings(s),
      () => undefined,
    )
    return () => {
      alive = false
    }
  }, [connected])
  const saveSettings = async (change: { draft_replies?: boolean; agent?: string | null; reply_mode?: ReplyMode }) => {
    if (!settings) return
    const before = settings
    setSettings({ ...settings, ...("draft_replies" in change ? { draft_replies: !!change.draft_replies } : {}), ...("agent" in change ? { agent: change.agent ?? null } : {}), ...(change.reply_mode ? { reply_mode: change.reply_mode } : {}) })
    setError(null)
    try {
      await waApi.saveSettings(change)
    } catch (e) {
      setSettings(before)
      setError((e as Error).message)
    }
  }
  const canDraft = !!settings && (!!settings.agent || settings.assistant_available)

  const act = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      setValues({})
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    }
    setBusy(false)
  }

  if (status === null) return <div className="h-24 animate-pulse rounded-2xl bg-white/[0.03]" />

  return (
    <div className="space-y-5">
      {error && <div className="rounded-xl bg-amber-500/10 px-4 py-3 text-[12px] text-amber-200">{error}</div>}

      {setup.length > 0 && (
        <div className="space-y-2 rounded-2xl border border-sky-400/20 bg-sky-400/[0.06] px-4 py-4">
          <div className="text-[13px] text-white/90">One more step in {providerMeta(status.provider ?? provider)?.label}</div>
          <ol className="list-decimal space-y-1.5 pl-5 text-[12px] leading-relaxed text-white/70">
            {setup.map((line, i) => (
              <li key={i} className="break-all">{line}</li>
            ))}
          </ol>
          <div className="text-[11px] text-white/40">This is shown once. To see it again, disconnect and reconnect.</div>
          <Button onClick={() => setSetup([])}>Done</Button>
        </div>
      )}

      {status.connected ? (
        <div className="space-y-3 rounded-2xl border border-line px-4 py-4">
          <div className="flex items-center gap-2 text-[13px] text-white/90">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Connected{status.mode === "own" && status.provider ? ` · ${providerMeta(status.provider)?.label ?? status.provider}` : ""}
            {status.phone ? ` · ${status.phone}` : ""}
          </div>
          <div className="text-[12px] leading-relaxed text-white/55">
            {status.mode === "aivory"
              ? "This account uses Aivory’s WhatsApp number. Messages people send to it are logged on their contact (a new contact is created for unknown numbers), and you can message contacts from their page."
              : "Messages people send to your number are logged on their contact (a new contact is created for unknown numbers), and you can message contacts from their page."}
          </div>
          {status.mode === "own" && (
            <Button onClick={() => void act(() => waApi.disconnect())} disabled={busy}>
              {busy ? "Disconnecting…" : "Disconnect"}
            </Button>
          )}
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void act(async () => {
              const r = await waApi.connect({ provider, credentials: values, display_phone: display })
              setSetup(r.setup)
            })
          }}
          className="space-y-3 rounded-2xl border border-line px-4 py-4"
        >
          <div className="text-[13px] text-white/90">Connect your WhatsApp number</div>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="WhatsApp provider">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={provider === p.id}
                onClick={() => {
                  setProvider(p.id)
                  setValues({})
                  setError(null)
                }}
                className={`rounded-full px-3 py-1 text-[12px] transition-colors ${provider === p.id ? "bg-white/[0.16] text-white" : "bg-white/[0.06] text-white/60 hover:text-white/85"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="text-[12px] leading-relaxed text-white/55">{meta.blurb} Your credentials are stored encrypted and are never shown again.</div>
          {meta.fields.map((f) => (
            <label key={f.key} className="block">
              <span className="mb-1 block text-[11px] text-white/45">
                {f.label}{f.optional ? " (optional)" : ""} <span className="text-white/30">· {f.hint}</span>
              </span>
              <input
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                type={f.secret ? "password" : "text"}
                autoComplete="off"
                placeholder={f.placeholder}
                aria-label={f.label}
                className={`w-full ${fieldClass}`}
              />
            </label>
          ))}
          <input value={display} onChange={(e) => setDisplay(e.target.value)} placeholder="Number for display, e.g. +62 812 3456 7890 (optional)" aria-label="Number for display" className={`w-full ${fieldClass}`} />
          <Button tone="primary" type="submit" disabled={busy || !ready}>
            {busy ? "Connecting…" : "Connect"}
          </Button>
        </form>
      )}

      {status.connected && settings && (
        <div className="space-y-3 rounded-2xl border border-line px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="text-[13px] text-white/90">Reply to incoming messages</span>
            <button
              type="button"
              role="switch"
              aria-checked={settings.draft_replies}
              aria-label="Reply to incoming messages"
              disabled={!canDraft && !settings.draft_replies}
              onClick={() => void saveSettings({ draft_replies: !settings.draft_replies })}
              className={`ml-auto flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors disabled:opacity-40 ${settings.draft_replies ? "bg-emerald-400/80" : "bg-white/15"}`}
            >
              <span className={`h-4 w-4 rounded-full bg-white transition-transform ${settings.draft_replies ? "translate-x-4" : ""}`} />
            </button>
          </div>
          <label className="block">
            <span className="mb-1 block text-[11px] text-white/45">Who writes the replies</span>
            <select
              value={settings.agent ?? ""}
              onChange={(e) => void saveSettings({ agent: e.target.value || null })}
              aria-label="Agent that writes the replies"
              className={`w-full ${fieldClass}`}
            >
              {settings.assistant_available ? <option value="">Aivory assistant</option> : <option value="">Choose one of your agents</option>}
              {settings.agents.map((a) => (
                <option key={a.type} value={a.type}>
                  {a.name} · {a.title}
                </option>
              ))}
            </select>
          </label>
          <div role="radiogroup" aria-label="What happens to the reply" className="space-y-1.5">
            {(
              [
                { mode: "approval", title: "Ask me first", text: "The agent writes a draft in the contact’s WhatsApp box. Nothing goes out until you press Send." },
                { mode: "autonomous", title: "Reply automatically", text: "The agent answers right away, on its own, inside the 24-hour window." },
              ] as const
            ).map((o) => (
              <button
                key={o.mode}
                type="button"
                role="radio"
                aria-checked={settings.reply_mode === o.mode}
                disabled={o.mode === "autonomous" && !canDraft}
                onClick={() => {
                  if (o.mode === "autonomous") setConfirmAuto(true)
                  else {
                    setConfirmAuto(false)
                    void saveSettings({ reply_mode: "approval" })
                  }
                }}
                className={`flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors disabled:opacity-40 ${settings.reply_mode === o.mode ? "border-white/25 bg-white/[0.06]" : "border-line hover:bg-white/[0.03]"}`}
              >
                <span className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${settings.reply_mode === o.mode ? "border-emerald-300" : "border-white/30"}`}>
                  {settings.reply_mode === o.mode && <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-[12.5px] text-white/90">{o.title}</span>
                  <span className="block text-[11.5px] leading-snug text-white/50">{o.text}</span>
                </span>
              </button>
            ))}
          </div>
          {confirmAuto && settings.reply_mode !== "autonomous" && (
            <div className="space-y-2 rounded-xl border border-amber-400/25 bg-amber-500/[0.07] px-3 py-3">
              <div className="text-[12.5px] text-amber-100">Let the agent reply to your customers by itself?</div>
              <div className="text-[11.5px] leading-relaxed text-amber-100/70">
                Replies go out immediately and can be wrong. It holds a reply back for your review (as a draft) when the customer asks for a person or complains, when a teammate wrote to them in the last 15 minutes, or after 4 automatic replies to the same contact in an hour (60 an hour overall). Automatic replies are marked in the timeline. You can switch back any time.
              </div>
              <div className="flex gap-2">
                <Button
                  tone="primary"
                  onClick={() => {
                    setConfirmAuto(false)
                    void saveSettings({ reply_mode: "autonomous" })
                  }}
                >
                  Turn on automatic replies
                </Button>
                <Button onClick={() => setConfirmAuto(false)}>Cancel</Button>
              </div>
            </div>
          )}
          <div className="text-[12px] leading-relaxed text-white/50">
            Your own agent knows your business and runs on your plan. The customer’s message text is processed by your agent and Aivory’s AI service. Off by default.
          </div>
        </div>
      )}

      <div className="text-[11px] leading-relaxed text-white/40">
        WhatsApp lets you send free-form messages only within 24 hours of the person’s last message to you. Outside that window a message is rejected, and an approved template is needed to start the chat again.
      </div>
    </div>
  )
}
