"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react"
import {
  MAX_STATUSES,
  MAX_STATUS_NAME,
  STATUS_GROUPS,
  STATUS_GROUP_LABEL,
  type StatusDef,
  type StatusGroup,
} from "@/lib/workspaceDbModel"

const GROUP_HINT: Record<StatusGroup, string> = {
  todo: "Not started. New tasks land in the first one.",
  in_progress: "Being worked on. Moving a blocked task here warns.",
  done: "Finished. Counts toward progress and tells followers.",
  canceled: "Closed without finishing. Not overdue, not counted.",
}

const GROUP_DOT: Record<StatusGroup, string> = {
  todo: "bg-white/40",
  in_progress: "bg-amber-400",
  done: "bg-emerald-400",
  canceled: "bg-red-400/60",
}

type Result = Promise<string | null> | string | null | void

/**
 * Status manager (Tasks P2): the room's statuses grouped into the four fixed
 * groups. Rename on blur / Enter, change group (which also recolors), reorder
 * inside a group, add per group, delete with "move its tasks to …".
 */
export function TaskStatuses({
  statuses,
  counts,
  onRename,
  onRegroup,
  onNudge,
  onAdd,
  onDelete,
}: {
  statuses: StatusDef[]
  /** Tasks per status name (for the delete prompt). */
  counts: Record<string, number>
  onRename: (from: string, to: string) => Result
  onRegroup: (name: string, group: StatusGroup) => Result
  onNudge: (name: string, dir: -1 | 1) => void
  onAdd: (name: string, group: StatusGroup) => Result
  onDelete: (name: string, moveTo: string) => Result
}) {
  const [error, setError] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Partial<Record<StatusGroup, string>>>({})
  const [deleting, setDeleting] = useState<{ name: string; moveTo: string } | null>(null)
  const full = statuses.length >= MAX_STATUSES

  const run = async (r: Result) => {
    const err = await r
    setError(err || null)
    return !err
  }

  const inGroup = (g: StatusGroup) => statuses.filter((d) => d.group === g)
  // Deleting the last status of a required group is refused; say why up front.
  const deletable = (d: StatusDef) => (d.group === "todo" || d.group === "done" ? inGroup(d.group).length > 1 : true)

  return (
    <div>
      <div className="mb-3 text-[12px] leading-relaxed text-white/35">
        Name your own statuses. The group decides what a status means: overdue, progress, blocked tasks and “My tasks”
        follow the group, not the name. Up to {MAX_STATUSES}; keep at least one in To do and one in Done.
      </div>
      {error && <div className="mb-3 rounded-xl border border-red-500/20 bg-red-500/[0.06] px-3 py-2 text-[12px] text-red-300">{error}</div>}
      <div className="grid gap-3 md:grid-cols-2">
        {STATUS_GROUPS.map((g) => {
          const list = inGroup(g)
          const draft = drafts[g] ?? ""
          return (
            <div key={g} className="rounded-xl border border-line bg-white/[0.02] p-3">
              <div className="mb-1 flex items-center gap-2 text-[12px] font-medium text-white/70">
                <span className={`h-2 w-2 rounded-full ${GROUP_DOT[g]}`} />
                {STATUS_GROUP_LABEL[g]}
              </div>
              <div className="mb-2 text-[11px] text-white/30">{GROUP_HINT[g]}</div>
              <div className="flex flex-col gap-1">
                {list.map((d, i) => (
                  <div key={d.name}>
                    <div className="group flex items-center gap-1.5">
                      <input
                        defaultValue={d.name}
                        key={d.name}
                        maxLength={MAX_STATUS_NAME}
                        aria-label={`Rename status ${d.name}`}
                        onBlur={(e) => {
                          const v = e.currentTarget.value
                          const el = e.currentTarget
                          void run(onRename(d.name, v)).then((ok) => {
                            if (!ok) el.value = d.name
                          })
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur()
                          if (e.key === "Escape") {
                            e.currentTarget.value = d.name
                            e.currentTarget.blur()
                          }
                        }}
                        className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-[12.5px] text-white/80 outline-none hover:border-line focus:border-white/20 focus:bg-white/[0.04]"
                      />
                      <span className="w-6 text-right text-[11px] text-white/25" title="Tasks in this status">{counts[d.name] ?? 0}</span>
                      <select
                        value={d.group}
                        onChange={(e) => void run(onRegroup(d.name, e.target.value as StatusGroup))}
                        aria-label={`Group of ${d.name}`}
                        className="rounded-lg border border-line bg-white/[0.04] px-1.5 py-1 text-[11px] text-white/60 outline-none"
                      >
                        {STATUS_GROUPS.map((x) => (
                          <option key={x} value={x}>{STATUS_GROUP_LABEL[x]}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => onNudge(d.name, -1)}
                        disabled={i === 0}
                        aria-label={`Move ${d.name} up`}
                        className="rounded p-0.5 text-white/30 hover:text-white disabled:opacity-20"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => onNudge(d.name, 1)}
                        disabled={i === list.length - 1}
                        aria-label={`Move ${d.name} down`}
                        className="rounded p-0.5 text-white/30 hover:text-white disabled:opacity-20"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          const moveTo = (list.find((x) => x.name !== d.name) ?? statuses.find((x) => x.name !== d.name))?.name ?? ""
                          setDeleting({ name: d.name, moveTo })
                        }}
                        disabled={!deletable(d)}
                        title={deletable(d) ? `Delete ${d.name}` : `Keep at least one status in ${STATUS_GROUP_LABEL[g]}`}
                        aria-label={`Delete ${d.name}`}
                        className="rounded p-0.5 text-white/25 hover:text-red-300 disabled:opacity-20"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {deleting?.name === d.name && (
                      <div className="mt-1 mb-1.5 flex flex-wrap items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/[0.05] px-2.5 py-2 text-[12px] text-white/60">
                        <span>
                          Delete “{d.name}”{(counts[d.name] ?? 0) > 0 ? ` and move its ${counts[d.name]} task${counts[d.name] === 1 ? "" : "s"} to` : "? Tasks in it go to"}
                        </span>
                        <select
                          value={deleting.moveTo}
                          onChange={(e) => setDeleting({ name: d.name, moveTo: e.target.value })}
                          aria-label="Move its tasks to"
                          className="rounded-lg border border-line bg-white/[0.04] px-1.5 py-1 text-[12px] text-white/70 outline-none"
                        >
                          {statuses.filter((x) => x.name !== d.name).map((x) => (
                            <option key={x.name} value={x.name}>{x.name}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => void run(onDelete(d.name, deleting.moveTo)).then((ok) => ok && setDeleting(null))}
                          className="rounded-full bg-red-500/80 px-3 py-1 text-[12px] font-medium text-white hover:bg-red-500"
                        >
                          Delete
                        </button>
                        <button onClick={() => setDeleting(null)} className="rounded-full px-2 py-1 text-[12px] text-white/40 hover:text-white/70">
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <form
                className="mt-2 flex items-center gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!draft.trim()) return
                  void run(onAdd(draft, g)).then((ok) => ok && setDrafts((p) => ({ ...p, [g]: "" })))
                }}
              >
                <input
                  value={draft}
                  maxLength={MAX_STATUS_NAME}
                  disabled={full}
                  onChange={(e) => setDrafts((p) => ({ ...p, [g]: e.target.value }))}
                  placeholder={full ? `${MAX_STATUSES} statuses max` : `Add to ${STATUS_GROUP_LABEL[g]}`}
                  className="min-w-0 flex-1 rounded-lg border border-line bg-white/[0.04] px-2 py-1 text-[12px] text-white/80 placeholder:text-white/25 outline-none disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={full || !draft.trim()}
                  aria-label={`Add status to ${STATUS_GROUP_LABEL[g]}`}
                  className="rounded-lg border border-line bg-white/[0.04] p-1 text-white/50 hover:text-white disabled:opacity-30"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </form>
            </div>
          )
        })}
      </div>
    </div>
  )
}
