"use client"

/**
 * Room notes (ADR-019 P5): short shared notes, list on the left, the open
 * note on the right. Replaces the old Notion-style pages. Edits autosave
 * after a short pause (and when you switch notes); the room's agents read
 * the newest notes as context.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { collabAuthHeaders } from "@/lib/collabClient"
import { formatDate } from "@/components/requests/requestUi"

interface Note {
  id: string
  title: string
  body: string
  updatedAt: string
}

const SAVE_DELAY_MS = 700
const TITLE_MAX = 120
const BODY_MAX = 20_000

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...collabAuthHeaders(), ...(init?.headers as Record<string, string> | undefined) },
  })
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
  if (!r.ok) throw new Error(typeof j.error === "string" ? j.error : "Something went wrong. Try again.")
  return j as T
}

export default function RoomNotes({ roomId, canWrite }: { roomId: string; canWrite: boolean }) {
  const base = `/api/workspace/${roomId}/notes`
  const [notes, setNotes] = useState<Note[] | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [confirmDelete, setConfirmDelete] = useState(false)
  const pending = useRef<{ id: string; patch: Partial<Note> } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    try {
      const j = await api<{ notes: Note[] }>(base)
      setNotes(j.notes)
      setOpenId((cur) => cur ?? j.notes[0]?.id ?? null)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [base])

  useEffect(() => {
    // Fetch on mount; load() only sets state after its await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const p = pending.current
    if (!p) return
    pending.current = null
    setSaving("saving")
    try {
      await api(`${base}/${p.id}`, { method: "PATCH", body: JSON.stringify(p.patch) })
      setSaving("saved")
    } catch (e) {
      setSaving("error")
      setError((e as Error).message)
    }
  }, [base])

  useEffect(() => () => void flush(), [flush])

  const edit = (id: string, patch: Partial<Note>) => {
    setNotes((cur) => (cur ?? []).map((n) => (n.id === id ? { ...n, ...patch, updatedAt: new Date().toISOString() } : n)))
    pending.current = { id, patch: { ...(pending.current?.id === id ? pending.current.patch : {}), ...patch } }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS)
  }

  const open = async (id: string) => {
    await flush()
    setConfirmDelete(false)
    setOpenId(id)
  }

  const create = async () => {
    await flush()
    try {
      const j = await api<{ note: Note }>(base, { method: "POST", body: JSON.stringify({ title: "" }) })
      setNotes((cur) => [j.note, ...(cur ?? [])])
      setOpenId(j.note.id)
      setConfirmDelete(false)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const remove = async (id: string) => {
    pending.current = null
    try {
      await api(`${base}/${id}`, { method: "DELETE" })
      setNotes((cur) => {
        const next = (cur ?? []).filter((n) => n.id !== id)
        setOpenId(next[0]?.id ?? null)
        return next
      })
      setConfirmDelete(false)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const note = (notes ?? []).find((n) => n.id === openId) ?? null

  return (
    <div className="flex min-w-0 flex-1">
      <div className="flex w-[260px] shrink-0 flex-col border-r border-line">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-white/35">Notes</span>
          {canWrite && (
            <button
              type="button"
              onClick={create}
              className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] text-white/55 transition-[transform,background-color,color] duration-150 ease-out hover:bg-white/[0.06] hover:text-white/85 active:scale-[0.97]"
            >
              <Plus className="h-3.5 w-3.5" /> New note
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          {notes === null ? (
            <div className="space-y-2 px-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-xl bg-white/[0.03]" />
              ))}
            </div>
          ) : notes.length === 0 ? (
            <div className="px-3 py-6 text-[12px] leading-relaxed text-white/35">
              {canWrite ? "No notes yet. Keep decisions, meeting notes and anything the team and agents should remember here." : "No notes yet."}
            </div>
          ) : (
            notes.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => open(n.id)}
                className={`mb-0.5 w-full rounded-xl px-3 py-2 text-left transition-colors duration-150 ${n.id === openId ? "bg-white/[0.07]" : "hover:bg-white/[0.04]"}`}
              >
                <div className="truncate text-[13px] text-white/80">{n.title.trim() || "Untitled note"}</div>
                <div className="mt-0.5 truncate text-[11px] text-white/30">
                  {formatDate(n.updatedAt)}
                  {n.body.trim() ? ` · ${n.body.trim().slice(0, 60)}` : ""}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {error && <div className="mx-8 mt-4 rounded-xl bg-amber-500/10 px-4 py-2.5 text-[12px] text-amber-200">{error}</div>}
        {note ? (
          <div className="mx-auto flex w-full max-w-[760px] flex-1 flex-col px-8 py-6">
            <div className="mb-3 flex items-center gap-3">
              <input
                value={note.title}
                onChange={(e) => edit(note.id, { title: e.target.value.slice(0, TITLE_MAX) })}
                readOnly={!canWrite}
                placeholder="Untitled note"
                aria-label="Note title"
                className="min-w-0 flex-1 bg-transparent text-[20px] font-medium tracking-tight text-white/90 outline-none placeholder:text-white/20"
              />
              <span className="shrink-0 text-[11px] text-white/30" aria-live="polite">
                {saving === "saving" ? "Saving…" : saving === "saved" ? "Saved" : saving === "error" ? "Not saved" : ""}
              </span>
              {canWrite &&
                (confirmDelete ? (
                  <span className="flex shrink-0 items-center gap-2 rounded-full bg-red-500/10 px-3 py-1 text-[12px]">
                    <button type="button" onClick={() => remove(note.id)} className="font-medium text-red-300 hover:text-red-200">
                      Delete
                    </button>
                    <button type="button" onClick={() => setConfirmDelete(false)} className="text-white/45 hover:text-white/75">
                      Keep
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    aria-label="Delete note"
                    className="shrink-0 rounded-full p-1.5 text-white/25 hover:bg-red-500/10 hover:text-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ))}
            </div>
            <textarea
              value={note.body}
              onChange={(e) => edit(note.id, { body: e.target.value.slice(0, BODY_MAX) })}
              readOnly={!canWrite}
              placeholder="Write the note. Agents in this room read the newest notes."
              aria-label="Note"
              className="min-h-[320px] w-full flex-1 resize-none bg-transparent text-[14px] leading-relaxed text-white/80 outline-none placeholder:text-white/20"
            />
          </div>
        ) : (
          notes !== null && (
            <div className="flex flex-1 items-center justify-center text-[13px] text-white/30">
              {canWrite ? "Create a note to start." : "Nothing to show."}
            </div>
          )
        )}
      </div>
    </div>
  )
}
