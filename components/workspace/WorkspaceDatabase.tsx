"use client"

import { useState, useRef, useEffect } from "react"
import * as Y from "yjs"
import { WebsocketProvider } from "y-websocket"
import { Table, Kanban, Plus, GripVertical, Calendar, User, Flag } from "lucide-react"

type Row = { id: string; title: string; status: string; priority: "Low" | "Med" | "High"; assignee: string; due: string }

const STATUSES = ["Todo", "Doing", "Done"] as const
const PRIORITIES = ["Low", "Med", "High"] as const

const STATUS_DOT: Record<string, string> = {
  Todo: "bg-white/40",
  Doing: "bg-amber-400",
  Done: "bg-emerald-400",
}

function uid() {
  return Math.random().toString(36).slice(2, 8)
}

function yMapFromRow(r: Row): Y.Map<unknown> {
  const m = new Y.Map<unknown>()
  for (const [k, v] of Object.entries(r)) m.set(k, v)
  return m
}

function toRows(arr: Y.Array<Y.Map<unknown>>): Row[] {
  return arr.toArray().map((m) => ({
    id: (m.get("id") as string) ?? uid(),
    title: (m.get("title") as string) ?? "",
    status: (m.get("status") as string) ?? "Todo",
    priority: (m.get("priority") as Row["priority"]) ?? "Med",
    assignee: (m.get("assignee") as string) ?? "",
    due: (m.get("due") as string) ?? "",
  }))
}

function PriorityPill({ p }: { p: Row["priority"] }) {
  const cls =
    p === "High"
      ? "bg-red-500/10 text-red-300 border-red-500/20"
      : p === "Med"
        ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
        : "bg-white/[0.06] text-white/45 border-white/10"
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}>{p}</span>
}

function StatusPill({ s }: { s: string }) {
  const cls =
    s === "Doing"
      ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
      : s === "Done"
        ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
        : "bg-white/[0.06] text-white/50 border-white/10"
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[s] ?? "bg-white/40"}`} />
      {s}
    </span>
  )
}

export default function WorkspaceDatabase({ docId }: { docId: string }) {
  const docRef = useRef<Y.Doc | null>(null)
  const yRowsRef = useRef<Y.Array<Y.Map<unknown>> | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [view, setView] = useState<"table" | "kanban" | "calendar">("table")
  const [statusFilter, setStatusFilter] = useState<string>("All")
  const [priorityFilter, setPriorityFilter] = useState<string>("All")
<<<<<<< HEAD
  const [peers, setPeers] = useState<number>(1)
=======
>>>>>>> 088ef58 (feat(workspace): Calendar view + filters (AFFiNE parity))
  const storageKey = `aivory:workspace:db:${docId}`
  const agentOrigin = () => (typeof window !== "undefined" ? (localStorage.getItem("aivory:agentType") || "user") : "user")

  useEffect(() => {
    const doc = new Y.Doc()
    const yRows = doc.getArray<Y.Map<unknown>>("database")
    docRef.current = doc
    yRowsRef.current = yRows

    const saved = localStorage.getItem(storageKey)
    if (saved) {
      try {
        Y.applyUpdate(doc, Uint8Array.from(JSON.parse(saved) as number[]))
      } catch {}
    }
    if (yRows.length === 0) {
      const seed: Row[] = [
        { id: uid(), title: "Qualify Acme lead", status: "Todo", priority: "High", assignee: "Leads Agent", due: "2026-09-10" },
        { id: uid(), title: "Fix login bug", status: "Doing", priority: "Med", assignee: "Ticket Ops", due: "2026-09-12" },
        { id: uid(), title: "Q3 Roadmap review", status: "Done", priority: "Low", assignee: "Generalist", due: "2026-09-08" },
      ]
      doc.transact(() => {
        for (const r of seed) yRows.push([yMapFromRow(r)])
      }, agentOrigin())
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRows(toRows(yRows))

    const obs = () => {
      setRows(toRows(yRows))
      const upd = Y.encodeStateAsUpdate(doc)
      localStorage.setItem(storageKey, JSON.stringify(Array.from(upd)))
      fetch(`/api/workspace/${docId}/doc`, { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: upd as unknown as BodyInit }).catch(() => {})
    }
    yRows.observe(obs)

    const wsUrl = typeof window !== "undefined" && window.location.hostname === "localhost" ? "ws://localhost:3200" : "wss://aivory.uk/yjs"
    let provider: WebsocketProvider | null = null
    try {
      provider = new WebsocketProvider(wsUrl, `workspace:db:${docId}`, doc, { connect: true })
      const agentType = typeof window !== "undefined" ? (localStorage.getItem("aivory:agentType") || "user") : "user"
      const userId = typeof window !== "undefined" ? (localStorage.getItem("aivory:userId") || "anon") : "anon"
      const color = agentType === "user" ? "#7c3aed" : agentType.includes("leads") ? "#f59e0b" : "#10b981"
      const name = agentType === "user" ? "You" : agentType.replace(/_/g, " ")
      provider.awareness.setLocalStateField("user", { name, color, agentType, userId })
      provider.awareness.on("change", () => setPeers(provider!.awareness.getStates().size))
      setPeers(provider.awareness.getStates().size)
    } catch {}

    fetch(`/api/workspace/${docId}/doc`)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .then((buf) => {
        if (buf && buf.byteLength > 0) Y.applyUpdate(doc, new Uint8Array(buf))
      })
      .catch(() => {})

    return () => {
      yRows.unobserve(obs)
      provider?.destroy()
      doc.destroy()
    }
  }, [docId, storageKey])

  const addRow = () => {
    const yRows = yRowsRef.current
    const doc = docRef.current
    if (!yRows || !doc) return
    const r: Row = { id: uid(), title: "", status: "Todo", priority: "Med", assignee: "", due: "" }
    doc.transact(() => yRows.push([yMapFromRow(r)]), agentOrigin())
  }

  const updateRow = (id: string, patch: Partial<Row>) => {
    const yRows = yRowsRef.current
    const doc = docRef.current
    if (!yRows || !doc) return
    const idx = toRows(yRows).findIndex((x) => x.id === id)
    if (idx < 0) return
    const m = yRows.get(idx) as Y.Map<unknown>
    doc.transact(() => {
      for (const [k, v] of Object.entries(patch)) m.set(k, v)
    }, agentOrigin())
  }

  const onDropKanban = (e: React.DragEvent, status: string) => {
    const id = e.dataTransfer.getData("text/plain")
    if (id) updateRow(id, { status })
  }

  const filtered = rows.filter(
    (r) => (statusFilter === "All" || r.status === statusFilter) && (priorityFilter === "All" || r.priority === priorityFilter),
  )

  // Calendar helpers (current month)
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDow = new Date(year, month, 1).getDay()
  const monthName = now.toLocaleString("en-US", { month: "long", year: "numeric" })
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  return (
    <div className="mx-auto w-full max-w-[900px]">
      {/* Header — AFFiNE-like database title + view switcher (LobeHub pill style) */}
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-full bg-white/[0.04] p-1">
              <button
                onClick={() => setView("table")}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium transition ${view === "table" ? "bg-white text-black shadow-sm" : "text-white/50 hover:text-white/80"}`}
              >
                <Table className="h-3.5 w-3.5" />
                Table
              </button>
              <button
                onClick={() => setView("kanban")}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium transition ${view === "kanban" ? "bg-white text-black shadow-sm" : "text-white/50 hover:text-white/80"}`}
              >
                <Kanban className="h-3.5 w-3.5" />
                Board
              </button>
              <button
                onClick={() => setView("calendar")}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium transition ${view === "calendar" ? "bg-white text-black shadow-sm" : "text-white/50 hover:text-white/80"}`}
              >
                <Calendar className="h-3.5 w-3.5" />
                Calendar
              </button>
            </div>
            <span className="text-[12px] text-white/25">{filtered.length}/{rows.length}</span>
<<<<<<< HEAD
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300">{peers} peer{peers !== 1 ? "s" : ""} · y-octo</span>
=======
>>>>>>> 088ef58 (feat(workspace): Calendar view + filters (AFFiNE parity))
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-full bg-white/[0.04] p-1">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-transparent px-2 py-1 text-[12px] text-white/60 outline-none"
              >
                <option value="All">All status</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <span className="text-white/10">|</span>
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="bg-transparent px-2 py-1 text-[12px] text-white/60 outline-none"
              >
                <option value="All">All priority</option>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={addRow}
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[12.5px] font-medium text-black shadow-sm transition hover:bg-white/90"
            >
              <Plus className="h-3.5 w-3.5" />
              New
            </button>
          </div>
        </div>
      </div>

      {view === "table" ? (
        <div className="overflow-hidden rounded-[14px] border border-line bg-surface-1">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-line bg-white/[0.02]">
                  <th className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-widest text-white/30">Title</th>
                  <th className="px-3 py-2.5 text-[11px] font-medium uppercase tracking-widest text-white/30">Status</th>
                  <th className="px-3 py-2.5 text-[11px] font-medium uppercase tracking-widest text-white/30">Priority</th>
                  <th className="px-3 py-2.5 text-[11px] font-medium uppercase tracking-widest text-white/30">Assignee</th>
                  <th className="px-3 py-2.5 text-[11px] font-medium uppercase tracking-widest text-white/30">Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtered.map((r) => (
                  <tr key={r.id} className="group hover:bg-white/[0.03]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <GripVertical className="h-3.5 w-3.5 shrink-0 text-white/15 opacity-0 group-hover:opacity-100" />
                        <input
                          value={r.title}
                          onChange={(e) => updateRow(r.id, { title: e.target.value })}
                          placeholder="Untitled"
                          className="w-full bg-transparent text-[13.5px] text-white/85 placeholder:text-white/25 outline-none"
                        />
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <select
                        value={r.status}
                        onChange={(e) => updateRow(r.id, { status: e.target.value })}
                        className="rounded-full border bg-surface-2 px-2.5 py-1 text-[12px] text-white/70 outline-none"
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      <PriorityPill p={r.priority} />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <User className="h-3 w-3 text-white/25" />
                        <input
                          value={r.assignee}
                          onChange={(e) => updateRow(r.id, { assignee: e.target.value })}
                          placeholder="—"
                          className="w-full bg-transparent text-[13px] text-white/60 placeholder:text-white/25 outline-none"
                        />
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3 w-3 text-white/25" />
                        <input
                          type="date"
                          value={r.due}
                          onChange={(e) => updateRow(r.id, { due: e.target.value })}
                          className="bg-transparent text-[13px] text-white/60 outline-none"
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            onClick={addRow}
            className="flex w-full items-center gap-2 border-t border-line px-4 py-3 text-left text-[13px] text-white/40 hover:bg-white/[0.02] hover:text-white/60"
          >
            <Plus className="h-3.5 w-3.5" />
            New row
          </button>
        </div>
      ) : view === "kanban" ? (
        <div className="grid grid-cols-3 gap-4">
          {STATUSES.map((s) => (
            <div
              key={s}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDropKanban(e, s)}
              className="rounded-[14px] border border-line bg-white/[0.02] p-3"
            >
              <div className="mb-3 flex items-center gap-2 px-1">
                <span className={`h-2 w-2 rounded-full ${STATUS_DOT[s]}`} />
                <span className="text-[12px] font-medium uppercase tracking-wider text-white/60">{s}</span>
                <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[11px] font-medium text-white/40">
                  {filtered.filter((r) => r.status === s).length}
                </span>
              </div>
              <div className="flex flex-col gap-2.5">
                {filtered
                  .filter((r) => r.status === s)
                  .map((r) => (
                    <div
                      key={r.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", r.id)}
                      className="group cursor-grab rounded-[12px] border border-line bg-surface-1 p-4 shadow-sm transition hover:border-white/10 active:cursor-grabbing"
                    >
                      <div className="text-[13.5px] font-medium leading-snug text-white/85">{r.title || "Untitled"}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <PriorityPill p={r.priority} />
                        {r.assignee && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-white/50">
                            <User className="h-3 w-3" />
                            {r.assignee}
                          </span>
                        )}
                      </div>
                      {r.due && (
                        <div className="mt-2 flex items-center gap-1 text-[11px] text-white/35">
                          <Calendar className="h-3 w-3" />
                          {new Date(r.due).toLocaleDateString("en-GB")}
                        </div>
                      )}
                    </div>
                  ))}
                <button
                  onClick={addRow}
                  className="flex items-center justify-center gap-1.5 rounded-[12px] border border-dashed border-white/10 py-2.5 text-[12px] text-white/30 hover:border-white/15 hover:bg-white/[0.02] hover:text-white/50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-[14px] border border-line bg-surface-1 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[13px] font-medium text-white/80">{monthName}</span>
            <span className="text-[11px] text-white/30">{filtered.filter((r) => r.due).length} dated</span>
          </div>
          <div className="grid grid-cols-7 gap-1 text-[11px]">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="py-1 text-center font-medium uppercase tracking-wider text-white/25">
                {d}
              </div>
            ))}
            {Array.from({ length: firstDow === 0 ? 6 : firstDow - 1 }).map((_, i) => (
              <div key={`e-${i}`} className="h-[88px] rounded-[10px] bg-transparent" />
            ))}
            {days.map((d) => {
              const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
              const items = filtered.filter((r) => r.due === iso)
              return (
                <div key={d} className="min-h-[88px] rounded-[10px] border border-line bg-white/[0.02] p-1.5">
                  <div className="text-[11px] font-medium text-white/40">{d}</div>
                  <div className="mt-1 flex flex-col gap-1">
                    {items.map((r) => (
                      <div key={r.id} className="truncate rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-black">
                        {r.title || "Untitled"}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          {filtered.filter((r) => !r.due).length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-white/30">Undated</div>
              <div className="flex flex-wrap gap-1.5">
                {filtered
                  .filter((r) => !r.due)
                  .map((r) => (
                    <span key={r.id} className="rounded-full border border-line bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/60">
                      {r.title || "Untitled"}
                    </span>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
