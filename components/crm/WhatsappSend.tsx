"use client"

/**
 * Message a contact on WhatsApp from their record page. Free text works within 24 hours of their last
 * message; outside that window WhatsApp only allows an approved template, so a closed window (or the
 * link) switches to the template picker. Shown only when WhatsApp is connected and the contact has a
 * usable number.
 */
import { useEffect, useMemo, useState } from "react"
import { Check, Sparkles } from "lucide-react"
import { Button, fieldClass } from "@/components/requests/requestUi"
import WhatsappIcon from "@/components/crm/WhatsappIcon"
import { whatsappDigits } from "@/lib/crmLabels"
import { renderTemplate } from "@/lib/whatsapp/templates"
import { MAX_TEXT, type WaTemplate } from "@/lib/whatsapp/types"
import { waApi, WaError, type TemplateListing } from "@/lib/whatsappClient"

type Note = { tone: "ok" | "bad"; text: string } | null

export default function WhatsappSend({ contactId, name, phone, onSent }: { contactId: string; name: string; phone: string | null; onSent: () => void }) {
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<Note>(null)
  const [mode, setMode] = useState<"text" | "template">("text")
  const [listing, setListing] = useState<TemplateListing | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [picked, setPicked] = useState("")
  const [vars, setVars] = useState<string[]>([])
  const [draft, setDraft] = useState<string | null>(null)
  const usable = whatsappDigits(phone) !== null

  // An AI draft shows up a few seconds after a customer message arrives (when the account turned drafts on).
  // Look for one while the page is open; stop once there is one.
  useEffect(() => {
    if (!usable || draft !== null) return
    let alive = true
    const look = () =>
      waApi.draft(contactId).then((d) => {
        if (!alive || !d) return
        setDraft(d.text)
        // Never overwrite something the person is already typing.
        setText((cur) => (cur.trim() === "" ? d.text : cur))
      })
    void look()
    const t = setInterval(() => void look(), 10_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [contactId, usable, draft])

  useEffect(() => {
    if (mode !== "template" || listing || listError) return
    waApi.templates().then(setListing, (e: Error) => setListError(e.message))
  }, [mode, listing, listError])

  const templates = useMemo<WaTemplate[]>(() => (listing && "templates" in listing ? listing.templates : []), [listing])
  const tpl = useMemo(() => templates.find((t) => `${t.name}|${t.language}` === picked) ?? null, [templates, picked])

  const pick = (key: string) => {
    setPicked(key)
    const t = templates.find((x) => `${x.name}|${x.language}` === key)
    // {{1}} is almost always the person's name, so start with their first name.
    setVars(t ? Array.from({ length: t.params }, (_, i) => (i === 0 ? name.trim().split(/\s+/)[0] ?? "" : "")) : [])
  }

  const done = (r: { logged: boolean }, what: string) => {
    setNote({ tone: "ok", text: r.logged ? `${what} and added to the timeline.` : `${what}, but it could not be added to the timeline.` })
    onSent()
  }

  const sendText = async () => {
    if (busy || !text.trim()) return
    setBusy(true)
    setNote(null)
    try {
      const r = await waApi.send(contactId, text.trim())
      setText("")
      setDraft(null)
      done(r, "Sent")
    } catch (e) {
      if (e instanceof WaError && e.code === "window_closed") {
        setMode("template")
        setNote({ tone: "bad", text: "It has been over 24 hours since their last message, so WhatsApp only allows a template now. Pick a template." })
      } else setNote({ tone: "bad", text: (e as Error).message })
    }
    setBusy(false)
  }

  const sendTemplate = async () => {
    if (busy || !tpl) return
    setBusy(true)
    setNote(null)
    try {
      const r = await waApi.sendTemplate(contactId, tpl, vars)
      setPicked("")
      setVars([])
      done(r, "Template sent")
    } catch (e) {
      setNote({ tone: "bad", text: (e as Error).message })
    }
    setBusy(false)
  }

  const noteLine = note && (
    <span aria-live="polite" className={`flex items-start gap-1.5 text-[12px] ${note.tone === "ok" ? "text-emerald-300/85" : "text-amber-200/85"}`}>
      {note.tone === "ok" && <Check size={13} className="mt-0.5 shrink-0" />}
      {note.text}
    </span>
  )

  return (
    <div className="rounded-2xl border border-line px-4 py-4">
      <div className="mb-3 flex items-center gap-2 text-[13px] font-medium text-white/85">
        <WhatsappIcon size={16} brand />
        WhatsApp
        {usable && (
          <button
            type="button"
            onClick={() => {
              setMode(mode === "text" ? "template" : "text")
              setNote(null)
            }}
            className="ml-auto text-[11px] font-normal text-white/45 underline decoration-white/15 underline-offset-2 hover:text-white/80"
          >
            {mode === "text" ? "Use a template" : "Write a message"}
          </button>
        )}
      </div>
      {!usable ? (
        <div className="text-[12px] text-white/45">Add a phone number to this contact to message them on WhatsApp.</div>
      ) : mode === "text" ? (
        <div className="space-y-2">
          {draft !== null && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-sky-200/80">
              <Sparkles size={12} className="shrink-0" />
              <span>Draft from the Aivory assistant. Review it, then Send.</span>
              {text !== draft && (
                <button type="button" onClick={() => setText(draft)} className="underline decoration-sky-200/30 underline-offset-2 hover:text-sky-100">
                  Use draft
                </button>
              )}
              <button
                type="button"
                onClick={async () => {
                  // Wait for the delete: clearing first would let the next look-up bring the same draft back.
                  await waApi.discardDraft(contactId)
                  if (text === draft) setText("")
                  setDraft(null)
                }}
                className="ml-auto text-white/40 underline decoration-white/15 underline-offset-2 hover:text-white/75"
              >
                Discard
              </button>
            </div>
          )}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                void sendText()
              }
            }}
            maxLength={MAX_TEXT}
            rows={3}
            placeholder={`Message ${name}`}
            aria-label={`WhatsApp message to ${name}`}
            className={`w-full resize-none ${fieldClass}`}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button tone="primary" onClick={() => void sendText()} disabled={busy || !text.trim()}>
              {busy ? "Sending…" : "Send"}
            </Button>
            <span className="text-[11px] text-white/35">⌘ Enter to send</span>
          </div>
          {noteLine}
        </div>
      ) : (
        <div className="space-y-2.5">
          {listError ? (
            <div className="text-[12px] text-amber-200/85">{listError}</div>
          ) : !listing ? (
            <div className="h-9 animate-pulse rounded-xl bg-white/[0.04]" />
          ) : "unsupported" in listing ? (
            <div className="text-[12px] leading-relaxed text-white/50">{listing.unsupported}</div>
          ) : templates.length === 0 ? (
            <div className="text-[12px] leading-relaxed text-white/50">
              No approved templates yet{listing.hidden > 0 ? ` (${listing.hidden} need media or buttons with variables, which can’t be sent from here)` : ""}. Create and get one approved in your provider’s console first.
            </div>
          ) : (
            <>
              <select value={picked} onChange={(e) => pick(e.target.value)} aria-label="Template" className={`w-full ${fieldClass}`}>
                <option value="">Choose a template</option>
                {templates.map((t) => (
                  <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>
                    {t.name} · {t.language}
                  </option>
                ))}
              </select>
              {tpl && (
                <>
                  {vars.map((v, i) => (
                    <input key={i} value={v} onChange={(e) => setVars((all) => all.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Variable {{${i + 1}}}`} aria-label={`Variable ${i + 1}`} maxLength={1024} className={`w-full ${fieldClass}`} />
                  ))}
                  <div className="whitespace-pre-wrap rounded-xl bg-white/[0.04] px-3 py-2.5 text-[12.5px] leading-relaxed text-white/75">{renderTemplate(tpl.body, vars)}</div>
                  <Button tone="primary" onClick={() => void sendTemplate()} disabled={busy || vars.some((v) => v.trim() === "")}>
                    {busy ? "Sending…" : "Send template"}
                  </Button>
                </>
              )}
            </>
          )}
          {noteLine}
        </div>
      )}
    </div>
  )
}
