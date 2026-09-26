"use client"

/**
 * Room notes (ADR-019 P5): short shared notes, list on the left, the open
 * note on the right. Replaces the old Notion-style pages. Edits autosave
 * after a short pause (and when you switch notes); the room's agents read
 * the newest notes as context.
 *
 * P6: a note can be put on a day (it shows on the room's Timeline) and be
 * meant for one person or agent in the room; agents see notes meant for
 * them first.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { collabAuthHeaders } from "@/lib/collabClient"
import { formatDate } from "@/components/requests/requestUi"
import { agentDisplayName } from "@/lib/spaceAgent"
import { personName } from "@/lib/roomChat"
import { shortDay } from "@/lib/timeline"

interface Note {
  id: string
  title: string
  body: string
  updatedAt: string
  onDate: string | null
  forKind: "member" | "agent" | null
  forId: string | null
  forName: string
}

type NotePatch = Partial<Pick<Note, "title" | "body" | "onDate">> & { for?: { kind: "member" | "agent"; id: string } | null }

interface Addressee {
  key: string
  kind: "member" | "agent"
  id: string
  name: string
}

interface MembersPayload {
  owner: { id: string; email: string | null; name: string | null } | null
  users: { id: string; email: string | null; name: string | null }[]
  team?: { id: string; email: string | null; name: string | null }[]
  agents: { type: string }[]
}

function addresseesOf(m: MembersPayload): Addressee[] {
  const people = new Map<string, Addressee>()
  for (const u of [m.owner, ...m.users, ...(m.team ?? [])]) {
    if (!u || people.has(u.id)) continue
    people.set(u.id, { key: `member:${u.id}`, kind: "member", id: u.id, name: personName(u.name || u.email || "Member") })
  }
  const agents = m.agents.map((a) => ({ key: `agent:${a.type}`, kind: "agent" as const, id: a.type, name: agentDisplayName(a.type) }))
  return [...people.values(), ...agents]
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

export default function RoomNotes({ roomId, canWrite, initialNoteId = null }: { roomId: string; canWrite: boolean; initialNoteId?: string | null }) {
  const base = `/api/workspace/${roomId}/notes`
  const [notes, setNotes] = useState<Note[] | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [addressees, setAddressees] = useState<Addressee[]>([])
  const pending = useRef<{ id: string; patch: NotePatch } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    try {
      const j = await api<{ notes: Note[] }>(base)
      setNotes(j.notes)
      setOpenId((cur) => cur ?? (initialNoteId && j.notes.some((n) => n.id === initialNoteId) ? initialNoteId : j.notes[0]?.id ?? null))
    } catch (e) {
      setError((e as Error).message)
    }
  }, [base, initialNoteId])

  useEffect(() => {
    let live = true
    fetch(`/api/workspace/${roomId}/members`, { headers: collabAuthHeaders(), cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<MembersPayload>) : null))
      .then((m) => live && m && setAddressees(addresseesOf(m)))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [roomId])

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

  const edit = (id: string, patch: NotePatch) => {
    const { for: target, ...plain } = patch
    const shown: Partial<Note> =
      target === undefined
        ? plain
        : { ...plain, forKind: target?.kind ?? null, forId: target?.id ?? null, forName: target ? addressees.find((a) => a.kind === target.kind && a.id === target.id)?.name ?? "" : "" }
    setNotes((cur) => (cur ?? []).map((n) => (n.id === id ? { ...n, ...shown, updatedAt: new Date().toISOString() } : n)))
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
                  {n.onDate && <span className="text-violet-200/70">{shortDay(n.onDate)} · </span>}
                  {n.forKind && n.forName && <span className="text-white/50">For {n.forName} · </span>}
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
            <div className="mb-4 flex flex-wrap items-center gap-2 text-[12px]">
              <label className="flex items-center gap-2 rounded-full bg-white/[0.04] py-1 pl-3 pr-2 text-white/45">
                <span>Date</span>
                <input
                  type="date"
                  value={note.onDate ?? ""}
                  onChange={(e) => edit(note.id, { onDate: e.target.value || null })}
                  disabled={!canWrite}
                  aria-label="Show on the timeline on"
                  className="bg-transparent text-white/80 outline-none [color-scheme:dark] disabled:opacity-60"
                />
              </label>
              <label className="flex items-center gap-2 rounded-full bg-white/[0.04] py-1 pl-3 pr-2 text-white/45">
                <span>For</span>
                <select
                  value={note.forKind && note.forId ? `${note.forKind}:${note.forId}` : ""}
                  onChange={(e) => {
                    const a = addressees.find((x) => x.key === e.target.value)
                    edit(note.id, { for: a ? { kind: a.kind, id: a.id } : null })
                  }}
                  disabled={!canWrite}
                  aria-label="Who this note is for"
                  className="max-w-[220px] bg-transparent text-white/80 outline-none disabled:opacity-60 [&>option]:bg-[#202024] [&>optgroup]:bg-[#202024]"
                >
                  <option value="">Everyone</option>
                  {note.forKind && note.forId && !addressees.some((a) => a.key === `${note.forKind}:${note.forId}`) && (
                    <option value={`${note.forKind}:${note.forId}`}>{note.forName || "Someone"}</option>
                  )}
                  {addressees.some((a) => a.kind === "member") && (
                    <optgroup label="People">
                      {addressees.filter((a) => a.kind === "member").map((a) => (
                        <option key={a.key} value={a.key}>
                          {a.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {addressees.some((a) => a.kind === "agent") && (
                    <optgroup label="Agents">
                      {addressees.filter((a) => a.kind === "agent").map((a) => (
                        <option key={a.key} value={a.key}>
                          {a.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </label>
              {note.onDate && <span className="text-white/30">Shows on the room&apos;s Timeline.</span>}
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
