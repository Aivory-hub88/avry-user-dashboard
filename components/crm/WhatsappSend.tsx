"use client"

/** Message a contact on WhatsApp from their record page. Shown only when WhatsApp is connected and the contact has a usable number. */
import { useState } from "react"
import { Check, MessageCircle } from "lucide-react"
import { Button, fieldClass } from "@/components/requests/requestUi"
import { whatsappDigits } from "@/lib/crmLabels"
import { MAX_TEXT } from "@/lib/kapsoLimits"
import { waApi } from "@/lib/whatsappClient"

export default function WhatsappSend({ contactId, name, phone, onSent }: { contactId: string; name: string; phone: string | null; onSent: () => void }) {
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ tone: "ok" | "bad"; text: string } | null>(null)
  const usable = whatsappDigits(phone) !== null

  const send = async () => {
    if (busy || !text.trim()) return
    setBusy(true)
    setNote(null)
    try {
      const r = await waApi.send(contactId, text.trim())
      setText("")
      setNote({ tone: "ok", text: r.logged ? "Sent and added to the timeline." : "Sent, but it could not be added to the timeline." })
      onSent()
    } catch (e) {
      setNote({ tone: "bad", text: (e as Error).message })
    }
    setBusy(false)
  }

  return (
    <div className="rounded-2xl border border-line px-4 py-4">
      <div className="mb-3 flex items-center gap-2 text-[13px] font-medium text-white/85">
        <MessageCircle size={14} className="text-emerald-300/80" />
        WhatsApp
      </div>
      {usable ? (
        <div className="space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                void send()
              }
            }}
            maxLength={MAX_TEXT}
            rows={3}
            placeholder={`Message ${name}`}
            aria-label={`WhatsApp message to ${name}`}
            className={`w-full resize-none ${fieldClass}`}
          />
          <div className="flex items-center gap-3">
            <Button tone="primary" onClick={() => void send()} disabled={busy || !text.trim()}>
              {busy ? "Sending…" : "Send"}
            </Button>
            <span className="text-[11px] text-white/35">⌘ Enter to send</span>
            {note && (
              <span aria-live="polite" className={`flex items-center gap-1.5 text-[12px] ${note.tone === "ok" ? "text-emerald-300/85" : "text-amber-200/85"}`}>
                {note.tone === "ok" && <Check size={13} />}
                {note.text}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="text-[12px] text-white/45">Add a phone number to this contact to message them on WhatsApp.</div>
      )}
    </div>
  )
}
