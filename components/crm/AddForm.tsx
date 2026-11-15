"use client"

import { useEffect, useRef, useState } from "react"
import { Check, Plus } from "lucide-react"
import { Button } from "@/components/requests/requestUi"

/**
 * State for the inline "add" forms (deal, company, contact). The submit button
 * stays clickable: a missing field gets a hint and focus instead of a silently
 * greyed-out button, and a saved record gets a short confirmation. Fields are
 * only cleared once the record is really saved.
 */
export type AddNote = { tone: "hint" | "ok"; text: string } | null

export function useAddForm() {
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState<AddNote>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])
  const flash = (n: AddNote, ms: number) => {
    if (timer.current) clearTimeout(timer.current)
    setNote(n)
    timer.current = setTimeout(() => setNote(null), ms)
  }
  const submit = async (opts: { problem: string | null; focus?: HTMLElement | null; create: () => Promise<boolean>; added: string; reset: () => void }) => {
    if (saving) return
    if (opts.problem) {
      opts.focus?.focus()
      flash({ tone: "hint", text: opts.problem }, 4000)
      return
    }
    setSaving(true)
    setNote(null)
    const ok = await opts.create()
    setSaving(false)
    if (!ok) return // the page-level error banner says why
    opts.reset()
    flash({ tone: "ok", text: opts.added }, 3000)
  }
  return { saving, note, submit, clearHint: () => note?.tone === "hint" && setNote(null) }
}

export function AddButton({ saving, label }: { saving: boolean; label: string }) {
  return (
    <Button tone="primary" type="submit" disabled={saving}>
      <span className="flex items-center gap-1">
        <Plus size={13} /> {saving ? "Adding…" : label}
      </span>
    </Button>
  )
}

export function AddNoteLine({ note }: { note: AddNote }) {
  return (
    <span aria-live="polite" className="min-h-[1em] basis-full text-[12px]">
      {note && (
        <span className={`inline-flex items-center gap-1.5 ${note.tone === "ok" ? "text-emerald-300/85" : "text-amber-200/80"}`}>
          {note.tone === "ok" && <Check size={13} />}
          {note.text}
        </span>
      )}
    </span>
  )
}
