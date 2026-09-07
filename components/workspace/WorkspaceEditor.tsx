"use client"

import { useEffect, useState, useRef } from "react"
import * as Y from "yjs"
import { WebsocketProvider } from "y-websocket"

type Block = { id: string; type: "h1" | "h2" | "p" | "todo" | "bullet" | "quote"; text: string; checked?: boolean }

function uid() {
  return Math.random().toString(36).slice(2, 8)
}

const DEFAULT_BLOCKS: Block[] = [
  { id: uid(), type: "h1", text: "Untitled" },
  { id: uid(), type: "p", text: "Yjs Doc active — edits sync via y-websocket (3220) and persist to localStorage + /api/workspace/[id]/doc." },
  { id: uid(), type: "todo", text: "Try typing, then hit Enter", checked: false },
  { id: uid(), type: "bullet", text: "Agents can create rows in Workspace DB" },
]

function toBlocks(yArray: Y.Array<Y.Map<unknown>>): Block[] {
  return yArray.toArray().map((m) => ({
    id: (m.get("id") as string) ?? uid(),
    type: (m.get("type") as Block["type"]) ?? "p",
    text: (m.get("text") as string) ?? "",
    checked: m.get("checked") as boolean | undefined,
  }))
}

function yMapFromBlock(block: Block): Y.Map<unknown> {
  const m = new Y.Map<unknown>()
  m.set("id", block.id)
  m.set("type", block.type)
  m.set("text", block.text)
  if (block.checked !== undefined) m.set("checked", block.checked)
  return m
}

export default function WorkspaceEditor({ docId }: { docId: string }) {
  const docRef = useRef<Y.Doc | null>(null)
  const yArrayRef = useRef<Y.Array<Y.Map<unknown>> | null>(null)
  const providerRef = useRef<WebsocketProvider | null>(null)

  const [blocks, setBlocks] = useState<Block[]>(DEFAULT_BLOCKS)
  const [slash, setSlash] = useState<{ idx: number; open: boolean }>({ idx: 0, open: false })
  const [status, setStatus] = useState<"local" | "synced" | "connecting">("connecting")
  const [peers, setPeers] = useState<number>(1)
  const storageKey = `aivory:workspace:yjs:${docId}`
  const agentOrigin = () => (typeof window !== "undefined" ? (localStorage.getItem("aivory:agentType") || "user") : "user")

  // init Y.Doc + Y.Array + y-websocket
  useEffect(() => {
    const doc = new Y.Doc()
    const yArray = doc.getArray<Y.Map<unknown>>("blocks")
    docRef.current = doc
    yArrayRef.current = yArray

    // restore from localStorage (Yjs update) or init with defaults
    const saved = localStorage.getItem(storageKey)
    if (saved) {
      try {
        const update = Uint8Array.from(JSON.parse(saved) as number[])
        Y.applyUpdate(doc, update)
      } catch {}
    }
    if (yArray.length === 0) {
      doc.transact(() => {
        for (const b of DEFAULT_BLOCKS) yArray.push([yMapFromBlock(b)])
      }, agentOrigin())
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBlocks(toBlocks(yArray))

    const observer = () => {
      setBlocks(toBlocks(yArray))
      // persist Yjs update to localStorage
      const update = Y.encodeStateAsUpdate(doc)
      localStorage.setItem(storageKey, JSON.stringify(Array.from(update)))
      // also PUT to API (fire-and-forget, no auth yet)
      fetch(`/api/workspace/${docId}/doc`, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: update as unknown as BodyInit,
      }).catch(() => {})
    }
    yArray.observe(observer)

    // y-octo (aivory-collab:3200) compat — y-websocket provider still works over wss://aivory.uk/yjs/:room
    // In prod, dashboard runs behind traefik; ws at wss://aivory.uk/yjs (collab:3200, fallback y-websocket:3220)
    const wsUrl =
      typeof window !== "undefined" && window.location.hostname === "localhost"
        ? "ws://localhost:3200"
        : "wss://aivory.uk/yjs"
    const agentType = typeof window !== "undefined" ? (localStorage.getItem("aivory:agentType") || "user") : "user"
    const userId = typeof window !== "undefined" ? (localStorage.getItem("aivory:userId") || "anon") : "anon"
    try {
      const provider = new WebsocketProvider(wsUrl, `workspace:${docId}`, doc, { connect: true })
      providerRef.current = provider
      // y-octo awareness: expose agentType so MissionControl + AgentRail can show “Leads Agent edited”
      const color = agentType === "user" ? "#7c3aed" : agentType.includes("leads") ? "#f59e0b" : "#10b981"
      const name = agentType === "user" ? "You" : agentType.replace(/_/g, " ")
      provider.awareness.setLocalStateField("user", { name, color, agentType, userId })
      provider.awareness.on("change", () => setPeers(provider.awareness.getStates().size))
      setPeers(provider.awareness.getStates().size)
      provider.on("status", (e: { status: string }) => {
        setStatus(e.status === "connected" ? "synced" : e.status === "connecting" ? "connecting" : "local")
      })
      // restore from server if available
      fetch(`/api/workspace/${docId}/doc`)
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .then((buf) => {
          if (buf && buf.byteLength > 0) {
            Y.applyUpdate(doc, new Uint8Array(buf))
          }
        })
        .catch(() => {})
    } catch {
      setStatus("local")
    }

    return () => {
      yArray.unobserve(observer)
      providerRef.current?.destroy()
      doc.destroy()
    }
  }, [docId, storageKey])

  const update = (i: number, patch: Partial<Block>) => {
    const yArray = yArrayRef.current
    const doc = docRef.current
    if (!yArray || !doc) return
    const m = yArray.get(i) as Y.Map<unknown>
    doc.transact(() => {
      for (const [k, v] of Object.entries(patch)) m.set(k, v)
    }, agentOrigin())
  }

  const addAfter = (i: number, type: Block["type"] = "p") => {
    const yArray = yArrayRef.current
    const doc = docRef.current
    if (!yArray || !doc) return
    const nb: Block = { id: uid(), type, text: "", ...(type === "todo" ? { checked: false } : {}) }
    doc.transact(() => {
      yArray.insert(i + 1, [yMapFromBlock(nb)])
    }, agentOrigin())
    setTimeout(() => document.getElementById(`block-${nb.id}`)?.focus(), 10)
  }

  const remove = (i: number) => {
    const yArray = yArrayRef.current
    const doc = docRef.current
    if (!yArray || !doc || yArray.length <= 1) return
    doc.transact(() => {
      yArray.delete(i, 1)
    }, agentOrigin())
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, i: number) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      const cur = blocks[i]
      addAfter(i, cur.type === "h1" || cur.type === "h2" ? "p" : cur.type)
    }
    if (e.key === "Backspace" && blocks[i].text === "") {
      e.preventDefault()
      remove(i)
    }
    if (e.key === "/" && blocks[i].text === "") {
      setSlash({ idx: i, open: true })
    }
  }

  const reset = () => {
    const yArray = yArrayRef.current
    const doc = docRef.current
    if (!yArray || !doc) return
    doc.transact(() => {
      yArray.delete(0, yArray.length)
      for (const b of DEFAULT_BLOCKS) yArray.push([yMapFromBlock(b)])
    }, agentOrigin())
  }

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <div className="mb-6 flex items-center gap-2 text-[11px] text-white/30">
        <span className={`rounded px-2 py-1 ${status === "synced" ? "bg-emerald-500/20 text-emerald-300" : status === "connecting" ? "bg-amber-500/20 text-amber-300" : "bg-white/[0.06]"}`}>
          {status === "synced" ? "Yjs synced" : status === "connecting" ? "Yjs connecting…" : "Yjs local"}
        </span>
        <span>•</span>
        <span>{blocks.length} blocks</span>
        <span>•</span>
        <span className="hidden sm:inline">ws {status === "synced" ? "3200" : "localStorage"} · {peers} peer{peers !== 1 ? "s" : ""} · y-octo</span>
        <button onClick={reset} className="ml-auto rounded bg-white/[0.06] px-2 py-1 hover:bg-white/[0.08]">
          Reset
        </button>
      </div>

      <div className="flex flex-col gap-1">
        {blocks.map((b, i) => (
          <div key={b.id} className="group flex items-start gap-2">
            <button
              onClick={() => addAfter(i)}
              className="mt-1 hidden h-6 w-6 shrink-0 items-center justify-center rounded text-white/20 hover:bg-white/[0.06] hover:text-white/60 group-hover:flex"
            >
              +
            </button>
            <div className="min-w-0 flex-1">
              {b.type === "todo" ? (
                <label className="flex items-start gap-2 py-1.5">
                  <input
                    type="checkbox"
                    checked={!!b.checked}
                    onChange={(e) => update(i, { checked: e.target.checked })}
                    className="mt-1 h-4 w-4 shrink-0 rounded border border-white/20 bg-transparent accent-white"
                  />
                  <div
                    id={`block-${b.id}`}
                    contentEditable
                    suppressContentEditableWarning
                    onInput={(e) => update(i, { text: (e.target as HTMLDivElement).innerText })}
                    onKeyDown={(e) => onKeyDown(e, i)}
                    className={`min-w-0 flex-1 outline-none ${b.checked ? "text-white/30 line-through" : "text-white/80"} ${slash.open && slash.idx === i ? "ring-1 ring-white/10" : ""}`}
                  >
                    {b.text}
                  </div>
                </label>
              ) : (
                <div
                  id={`block-${b.id}`}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={(e) => update(i, { text: (e.target as HTMLDivElement).innerText })}
                  onKeyDown={(e) => onKeyDown(e, i)}
                  className={`w-full rounded-lg px-3 py-1.5 outline-none focus:bg-white/[0.03] ${
                    b.type === "h1"
                      ? "text-[28px] font-semibold text-white/90"
                      : b.type === "h2"
                        ? "text-[20px] font-medium text-white/85"
                        : b.type === "quote"
                          ? "border-l-2 border-white/10 pl-3 italic text-white/60"
                          : b.type === "bullet"
                            ? "text-[14px] text-white/80 before:mr-2 before:content-['•']"
                            : "text-[14px] leading-relaxed text-white/80"
                  }`}
                >
                  {b.text}
                </div>
              )}
              {slash.open && slash.idx === i && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {(["h1", "h2", "p", "todo", "bullet", "quote"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => {
                        update(i, { type: t })
                        setSlash({ idx: 0, open: false })
                      }}
                      className="rounded-full border border-line bg-[#353531] px-3 py-1 text-[12px] text-white/60 hover:bg-white/[0.06] hover:text-white/90"
                    >
                      {t}
                    </button>
                  ))}
                  <button onClick={() => setSlash({ idx: 0, open: false })} className="px-2 text-[12px] text-white/30">
                    ✕
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-[12px] leading-relaxed text-white/40">
        Yjs Doc <code className="rounded bg-white/[0.06] px-1.5 py-0.5">workspace:{docId}</code> via{" "}
        <code className="rounded bg-white/[0.06] px-1.5 py-0.5">y-octo</code> @{" "}
        <code className="rounded bg-white/[0.06] px-1.5 py-0.5">wss://aivory.uk/yjs</code> ({" "}
        <code className="rounded bg-white/[0.06] px-1.5 py-0.5">ws://localhost:3200</code> fallback 3220) +{" "}
        <code className="rounded bg-white/[0.06] px-1.5 py-0.5">localStorage</code> +{" "}
        <code className="rounded bg-white/[0.06] px-1.5 py-0.5">/api/workspace/[id]/doc</code>.
      </div>
    </div>
  )
}
