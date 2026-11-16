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
import { waApi, type WaStatus } from "@/lib/whatsappClient"

export default function WhatsappSettings({ status, onChanged }: { status: WaStatus | null; onChanged: () => void }) {
  const [provider, setProvider] = useState<ProviderId>("kapso")
  const [values, setValues] = useState<Record<string, string>>({})
  const [display, setDisplay] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [setup, setSetup] = useState<string[]>([])
  const meta = providerMeta(provider) ?? PROVIDERS[0]
  const [drafts, setDrafts] = useState<boolean | null>(null)
  const connected = !!status?.connected
  useEffect(() => {
    if (!connected) return
    let alive = true
    waApi.settings().then((s) => alive && setDrafts(s.draft_replies), () => alive && setDrafts(false))
    return () => {
      alive = false
    }
  }, [connected])
  const toggleDrafts = async () => {
    if (drafts === null) return
    const next = !drafts
    setDrafts(next)
    setError(null)
    try {
      await waApi.setDraftReplies(next)
    } catch (e) {
      setDrafts(!next)
      setError((e as Error).message)
    }
  }
  const ready = meta.fields.every((f) => f.optional || (values[f.key] ?? "").trim() !== "")

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

      {status.connected && (
        <div className="space-y-2 rounded-2xl border border-line px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="text-[13px] text-white/90">Draft replies with the Aivory assistant</span>
            <button
              type="button"
              role="switch"
              aria-checked={drafts === true}
              aria-label="Draft replies with the Aivory assistant"
              disabled={drafts === null}
              onClick={() => void toggleDrafts()}
              className={`ml-auto flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors disabled:opacity-40 ${drafts ? "bg-emerald-400/80" : "bg-white/15"}`}
            >
              <span className={`h-4 w-4 rounded-full bg-white transition-transform ${drafts ? "translate-x-4" : ""}`} />
            </button>
          </div>
          <div className="text-[12px] leading-relaxed text-white/50">
            When someone messages you, the assistant writes a suggested reply and puts it in that contact’s WhatsApp box. Nothing is ever sent for you: you read it, edit it and press Send. The assistant only knows about Aivory, and the customer’s message text is processed by Aivory’s AI service. Off by default.
          </div>
        </div>
      )}

      <div className="text-[11px] leading-relaxed text-white/40">
        WhatsApp lets you send free-form messages only within 24 hours of the person’s last message to you. Outside that window a message is rejected, and an approved template is needed to start the chat again.
      </div>
    </div>
  )
}
