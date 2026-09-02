"use client"
/**
 * White-Box Memory — a modal listing what one agent remembers about the
 * user (zeroclaw-memory's key/value store, not the separate cognee-rs
 * graph memory, which has no browse surface), with inline edit/delete.
 * See docs/CERVEAU-WORKING-OFFICE-PLANNING.md's White-Box Memory feature
 * and lib/agentMemory.ts for the backend contract.
 *
 * Same non-heading-tag discipline as the rest of the office: every text
 * node here is a <span>/<div>, never <p>/<h1-6> — see
 * [dashboard-global-main-heading-css-gotcha] memory for why.
 */
import { useEffect, useState } from "react"
import { X, Pencil, Trash2, Check } from "lucide-react"
import {
  listMemory,
  editMemory,
  deleteMemory,
  describeCategory,
  looksTruncated,
  type MemoryEntry,
} from "@/lib/agentMemory"

interface MemoryModalProps {
  agentType: string | null
  agentTitle: string
  open: boolean
  onClose: () => void
}

export function MemoryModal({ agentType, agentTitle, open, onClose }: MemoryModalProps) {
  const [entries, setEntries] = useState<MemoryEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const load = () => {
    setError(null)
    setEntries(null)
    listMemory()
      .then((all) => setEntries(all.filter((e) => e._agent_type === agentType)))
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load memory."))
  }

  useEffect(() => {
    // Fetch-on-open pattern, same documented convention as useChat.ts's own
    // mount effect — this is a deliberate external fetch triggered by the
    // modal opening, not state synchronized from a prop.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) load()
    // Only re-fetch when the modal opens or targets a different agent —
    // not on every render of the entries/error state this effect itself sets.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, agentType])

  if (!open) return null

  const startEdit = (entry: MemoryEntry) => {
    setEditingKey(entry.key)
    setDraft(entry.content)
  }

  const save = async (entry: MemoryEntry) => {
    setBusyKey(entry.key)
    try {
      const updated = await editMemory(entry, draft)
      setEntries(
        (prev) => prev?.map((e) => (e.key === entry.key ? { ...e, content: updated?.content ?? draft } : e)) ?? prev,
      )
      setEditingKey(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.")
    } finally {
      setBusyKey(null)
    }
  }

  const remove = async (entry: MemoryEntry) => {
    if (!confirm(`Forget "${entry.key}"? This can't be undone.`)) return
    setBusyKey(entry.key)
    try {
      await deleteMemory(entry)
      setEntries((prev) => prev?.filter((e) => e.key !== entry.key) ?? prev)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete.")
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[80vh] w-full max-w-[560px] flex-col rounded-2xl border border-white/10 p-6 shadow-2xl"
        style={{ background: "#2f2f2c" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white/90"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-1 text-[19px] font-semibold text-white/95">What {agentTitle} remembers</div>
        <div className="mb-5 text-[13px] font-light text-white/45">
          Facts and notes this agent has stored about you — edit or forget anything here.
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto pr-1">
          {error && (
            <div className="flex items-center justify-between gap-3 rounded-lg border-l-2 border-l-amber bg-amber/6 px-3.5 py-2.5 text-[12.5px] text-white/70">
              <span>{error}</span>
              <button
                onClick={load}
                className="shrink-0 font-medium text-amber-light underline underline-offset-2 hover:text-amber-light-hover"
              >
                Retry
              </button>
            </div>
          )}
          {entries === null && !error && <div className="px-0.5 text-[13px] font-light text-white/35">Loading…</div>}
          {entries !== null && entries.length === 0 && !error && (
            <div className="px-0.5 text-[13px] font-light text-white/35">Nothing remembered yet.</div>
          )}

          {entries?.map((entry) => {
            const editing = editingKey === entry.key
            const busy = busyKey === entry.key
            return (
              <div key={entry.key} className="rounded-[14px] border border-white/[0.06] bg-white/[0.035] p-3.5">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="rounded-full bg-white/[0.06] px-2 py-[2px] text-[9.5px] font-semibold uppercase tracking-wider text-white/45">
                    {describeCategory(entry.category)}
                  </span>
                  {!editing && (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => startEdit(entry)}
                        aria-label={`Edit ${entry.key}`}
                        className="grid h-6 w-6 place-items-center rounded-md text-white/35 transition-colors hover:bg-white/[0.08] hover:text-white/80"
                      >
                        <Pencil className="h-[13px] w-[13px]" />
                      </button>
                      <button
                        onClick={() => remove(entry)}
                        disabled={busy}
                        aria-label={`Forget ${entry.key}`}
                        className="grid h-6 w-6 place-items-center rounded-md text-white/35 transition-colors hover:bg-white/[0.08] hover:text-red-300 disabled:opacity-40"
                      >
                        <Trash2 className="h-[13px] w-[13px]" />
                      </button>
                    </div>
                  )}
                </div>

                {editing ? (
                  <div className="flex flex-col gap-2">
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      rows={3}
                      className="w-full resize-none rounded-lg border border-white/10 bg-black/20 p-2.5 text-[13px] text-white/85 focus:border-accent/40 focus:outline-none"
                    />
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => save(entry)}
                        disabled={busy}
                        aria-busy={busy}
                        className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-[12.5px] font-semibold text-on-accent transition-[opacity,transform] duration-150 ease-out hover:opacity-90 active:scale-[0.97] disabled:opacity-50"
                      >
                        <Check className="h-[12px] w-[12px]" />
                        {busy ? "Saving…" : "Save"}
                      </button>
                      <button
                        onClick={() => setEditingKey(null)}
                        disabled={busy}
                        className="text-[12.5px] font-medium text-white/45 underline underline-offset-2 transition-colors hover:text-white/75"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-[13px] font-light leading-[1.5] text-white/70">
                    {entry.content}
                    {looksTruncated(entry.content) && (
                      <span className="ml-1 text-[11px] text-white/30">
                        (shown truncated — editing replaces the full text)
                      </span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
