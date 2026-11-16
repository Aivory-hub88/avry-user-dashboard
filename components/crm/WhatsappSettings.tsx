"use client"

/**
 * WhatsApp connection panel (inside the CRM's side drawer): shows the Aivory
 * number when the account has it, or lets a customer connect their own Kapso
 * number. Text lives in span/div only (see CrmApp).
 */
import { useState } from "react"
import { Button, fieldClass } from "@/components/requests/requestUi"
import { waApi, type WaStatus } from "@/lib/whatsappClient"

export default function WhatsappSettings({ status, onChanged }: { status: WaStatus | null; onChanged: () => void }) {
  const [apiKey, setApiKey] = useState("")
  const [phoneId, setPhoneId] = useState("")
  const [display, setDisplay] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const act = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      setApiKey("")
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

      {status.connected ? (
        <div className="space-y-3 rounded-2xl border border-line px-4 py-4">
          <div className="flex items-center gap-2 text-[13px] text-white/90">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Connected{status.phone ? ` · ${status.phone}` : ""}
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
            void act(() => waApi.connect({ api_key: apiKey, phone_number_id: phoneId, display_phone: display }))
          }}
          className="space-y-3 rounded-2xl border border-line px-4 py-4"
        >
          <div className="text-[13px] text-white/90">Connect your WhatsApp number</div>
          <div className="text-[12px] leading-relaxed text-white/55">
            Use a number connected in your own Kapso account. Create an API key in Kapso under Integrations, then copy the phone number ID shown next to your number. The key is stored encrypted and is never shown again.
          </div>
          <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} type="password" autoComplete="off" placeholder="Kapso API key" aria-label="Kapso API key" className={`w-full ${fieldClass}`} />
          <input value={phoneId} onChange={(e) => setPhoneId(e.target.value)} inputMode="numeric" autoComplete="off" placeholder="Phone number ID" aria-label="Phone number ID" className={`w-full ${fieldClass}`} />
          <input value={display} onChange={(e) => setDisplay(e.target.value)} placeholder="Number for display, e.g. +62 812 3456 7890 (optional)" aria-label="Number for display" className={`w-full ${fieldClass}`} />
          <Button tone="primary" type="submit" disabled={busy || apiKey.trim() === "" || phoneId.trim() === ""}>
            {busy ? "Connecting…" : "Connect"}
          </Button>
        </form>
      )}

      <div className="text-[11px] leading-relaxed text-white/40">
        WhatsApp lets you send free-form messages only within 24 hours of the person’s last message to you. Outside that window a message is rejected, and an approved template is needed to start the chat again.
      </div>
    </div>
  )
}
