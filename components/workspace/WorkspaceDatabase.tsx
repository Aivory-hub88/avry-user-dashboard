"use client"

import { useState, useRef, useEffect } from "react"
import * as Y from "yjs"
import { WebsocketProvider } from "y-websocket"

type Row = { id: string; title: string; status: string; priority: "Low" | "Med" | "High"; assignee: string; due: string }

const STATUSES = ["Todo", "Doing", "Done"] as const
const PRIORITIES = ["Low", "Med", "High"] as const

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

export default function WorkspaceDatabase({ docId }: { docId: string }) {
  const docRef = useRef<Y.Doc | null>(null)
  const yRowsRef = useRef<Y.Array<Y.Map<unknown>> | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [view, setView] = useState<"table" | "kanban">("table")
  const storageKey = `aivory:workspace:db:${docId}`

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
      })
    }
    setRows(toRows(yRows))

    const obs = () => {
      setRows(toRows(yRows))
      const upd = Y.encodeStateAsUpdate(doc)
      localStorage.setItem(storageKey, JSON.stringify(Array.from(upd)))
      fetch(`/api/workspace/${docId}/doc`, { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: upd as unknown as BodyInit }).catch(() => {})
    }
    yRows.observe(obs)

    // y-websocket (optional, graceful fallback)
    const wsUrl = typeof window !== "undefined" && window.location.hostname === "localhost" ? "ws://localhost:3220" : "wss://aivory.uk/yjs"
    let provider: WebsocketProvider | null = null
    try {
      provider = new WebsocketProvider(wsUrl, `workspace:db:${docId}`, doc, { connect: true })
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
    const r: Row = { id: uid(), title: "Untitled", status: "Todo", priority: "Med", assignee: "", due: "" }
    doc.transact(() => yRows.push([yMapFromRow(r)]))
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
    })
  }

  const onDropKanban = (e: React.DragEvent, status: string) => {
    const id = e.dataTransfer.getData("text/plain")
    if (id) updateRow(id, { status })
  }

  return (
    <div className="mx-auto w-full max-w-[860px]">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView("table")}
            className={`rounded-full px-3 py-1 text-[12px] ${view === "table" ? "bg-white text-black" : "border border-line bg-white/[0.04] text-white/60 hover:bg-white/[0.06]"}`}
          >
            Table
          </button>
          <button
            onClick={() => setView("kanban")}
            className={`rounded-full px-3 py-1 text-[12px] ${view === "kanban" ? "bg-white text-black" : "border border-line bg-white/[0.04] text-white/60 hover:bg-white/[0.06]"}`}
          >
            Kanban
          </button>
        </div>
        <button onClick={addRow} className="rounded-full bg-white px-3 py-1.5 text-[12px] font-medium text-black hover:bg-white/90">
          + New row
        </button>
      </div>

      {view === "table" ? (
        <div className="overflow-hidden rounded-[16px] border border-line bg-white/[0.03]">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-white/[0.04] text-[11px] uppercase tracking-wider text-white/40">
                <tr>
                  <th className="px-3 py-2">Title</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Priority</th>
                  <th className="px-3 py-2">Assignee</th>
                  <th className="px-3 py-2">Due</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-line hover:bg-white/[0.03]">
                    <td className="px-3 py-2">
                      <input
                        value={r.title}
                        onChange={(e) => updateRow(r.id, { title: e.target.value })}
                        className="w-full bg-transparent text-white/80 outline-none placeholder:text-white/30"
                        placeholder="Untitled"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={r.status}
                        onChange={(e) => updateRow(r.id, { status: e.target.value })}
                        className="rounded bg-[#353531] px-2 py-1 text-white/80 outline-none"
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={r.priority}
                        onChange={(e) => updateRow(r.id, { priority: e.target.value as Row["priority"] })}
                        className="rounded bg-[#353531] px-2 py-1 text-white/80 outline-none"
                      >
                        {PRIORITIES.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={r.assignee}
                        onChange={(e) => updateRow(r.id, { assignee: e.target.value })}
                        className="w-full bg-transparent text-white/60 outline-none"
                        placeholder="—"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="date"
                        value={r.due}
                        onChange={(e) => updateRow(r.id, { due: e.target.value })}
                        className="bg-transparent text-white/60 outline-none"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {STATUSES.map((s) => (
            <div
              key={s}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDropKanban(e, s)}
              className="rounded-[16px] border border-line bg-white/[0.02] p-3"
            >
              <div className="mb-2 text-[12px] font-medium uppercase tracking-wider text-white/40">
                {s} · {rows.filter((r) => r.status === s).length}
              </div>
              <div className="flex flex-col gap-2">
                {rows
                  .filter((r) => r.status === s)
                  .map((r) => (
                    <div
                      key={r.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", r.id)}
                      className="cursor-grab rounded-xl border border-line bg-[#353531] p-3 active:cursor-grabbing"
                    >
                      <div className="text-[13px] font-medium text-white/80">{r.title || "Untitled"}</div>
                      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-white/40">
                        <span className={`rounded px-1.5 py-0.5 ${r.priority === "High" ? "bg-red-500/20 text-red-300" : r.priority === "Med" ? "bg-amber-500/20 text-amber-300" : "bg-white/10"}`}>
                          {r.priority}
                        </span>
                        <span>{r.assignee || "—"}</span>
                      </div>
                    </div>
                  ))}
                {rows.filter((r) => r.status === s).length === 0 && <div className="py-6 text-center text-[12px] text-white/20">Drop here</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 text-[11px] text-white/30">
        Yjs `database` in same `Y.Doc` (`workspace:{docId}`) + `localStorage` + `PUT /api/workspace/[id]/doc`.
      </div>
    </div>
  )
}
