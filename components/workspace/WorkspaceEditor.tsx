"use client"

import { useEffect, useState, useRef } from "react"
import * as Y from "yjs"
import { WebsocketProvider } from "y-websocket"
import { collabAuthHeaders, collabWsParams } from "@/lib/collabClient"

type Block = { id: string; type: "h1" | "h2" | "p" | "todo" | "bullet" | "quote"; text: string; checked?: boolean }

function uid() {
  return Math.random().toString(36).slice(2, 8)
}

function yMapFromBlock(block: Block): Y.Map<unknown> {
  const m = new Y.Map<unknown>()
  m.set("id", block.id)
  m.set("type", block.type)
  m.set("text", block.text)
  if (block.checked !== undefined) m.set("checked", block.checked)
  return m
}

function toBlocks(yArray: Y.Array<Y.Map<unknown>>): Block[] {
  return yArray.toArray().map((m) => ({
    id: (m.get("id") as string) ?? uid(),
    type: (m.get("type") as Block["type"]) ?? "p",
    text: (m.get("text") as string) ?? "",
    checked: m.get("checked") as boolean | undefined,
  }))
}

export default function WorkspaceEditor({ docId, readOnly = false }: { docId: string; readOnly?: boolean }) {
  const docRef = useRef<Y.Doc | null>(null)
  const yArrayRef = useRef<Y.Array<Y.Map<unknown>> | null>(null)
  const providerRef = useRef<WebsocketProvider | null>(null)
  const readOnlyRef = useRef(readOnly)
  useEffect(() => {
    readOnlyRef.current = readOnly
  }, [readOnly])

  const [blocks, setBlocks] = useState<Block[]>([])
  const [slash, setSlash] = useState<{ idx: number; open: boolean }>({ idx: 0, open: false })
  const [ready, setReady] = useState(false)
  // v2: POC-era cached updates were stale demo text; server is source of truth
  const storageKey = `aivory:workspace:yjs:v2:${docId}`
  const agentOrigin = () => (typeof window !== "undefined" ? (localStorage.getItem("aivory:agentType") || "user") : "user")

  // init Y.Doc: local cache first, then server — seed a starter only when truly empty
  useEffect(() => {
    const doc = new Y.Doc()
    const yArray = doc.getArray<Y.Map<unknown>>("blocks")
    docRef.current = doc
    yArrayRef.current = yArray
    let alive = true
    let putTimer: ReturnType<typeof setTimeout> | null = null

    const saved = localStorage.getItem(storageKey)
    if (saved) {
      try {
        const update = Uint8Array.from(JSON.parse(saved) as number[])
        Y.applyUpdate(doc, update)
      } catch {}
    }

    const schedulePut = () => {
      if (readOnlyRef.current) return
      if (putTimer) clearTimeout(putTimer)
      putTimer = setTimeout(() => {
        const update = Y.encodeStateAsUpdate(doc)
        fetch(`/api/workspace/${docId}/doc`, {
          method: "PUT",
          headers: { "Content-Type": "application/octet-stream", ...collabAuthHeaders() },
          body: update as unknown as BodyInit,
        }).catch(() => {})
      }, 500)
    }

    const observer = () => {
      if (!alive) return
      setBlocks(toBlocks(yArray))
      try {
        const update = Y.encodeStateAsUpdate(doc)
        localStorage.setItem(storageKey, JSON.stringify(Array.from(update)))
      } catch {}
      schedulePut()
    }
    yArray.observe(observer)

    fetch(`/api/workspace/${docId}/doc`, { headers: collabAuthHeaders() })
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .then((buf) => {
        if (!alive) return
        if (buf && buf.byteLength > 0) {
          Y.applyUpdate(doc, new Uint8Array(buf))
        }
        // seed a blank starter only when nothing exists anywhere
        if (yArray.length === 0 && !readOnlyRef.current) {
          doc.transact(() => {
            yArray.push([yMapFromBlock({ id: uid(), type: "h1", text: "" })])
            yArray.push([yMapFromBlock({ id: uid(), type: "p", text: "" })])
          }, agentOrigin())
          schedulePut()
        }
        setBlocks(toBlocks(yArray))
        setReady(true)
      })
      .catch(() => {
        if (!alive) return
        // offline: use local cache only
        if (yArray.length === 0 && !readOnlyRef.current) {
          doc.transact(() => {
            yArray.push([yMapFromBlock({ id: uid(), type: "p", text: "" })])
          }, agentOrigin())
        }
        setBlocks(toBlocks(yArray))
        setReady(true)
      })

    const wsUrl =
      typeof window !== "undefined" && window.location.hostname === "localhost"
        ? "ws://localhost:3200"
        : "wss://aivory.uk/yjs"
    const agentType = typeof window !== "undefined" ? (localStorage.getItem("aivory:agentType") || "user") : "user"
    const userId = typeof window !== "undefined" ? (localStorage.getItem("aivory:userId") || "anon") : "anon"
    try {
      const provider = new WebsocketProvider(wsUrl, `workspace:${docId}`, doc, { connect: true, params: collabWsParams() })
      providerRef.current = provider
      const color = agentType === "user" ? "#7c3aed" : agentType.includes("leads") ? "#f59e0b" : "#10b981"
      const name = agentType === "user" ? "You" : agentType.replace(/_/g, " ")
      provider.awareness.setLocalStateField("user", { name, color, agentType, userId })
    } catch {}

    return () => {
      alive = false
      if (putTimer) clearTimeout(putTimer)
      yArray.unobserve(observer)
      providerRef.current?.destroy()
      doc.destroy()
    }
  }, [docId, storageKey])

  const guard = () => {
    if (readOnlyRef.current) return false
    return true
  }

  const update = (i: number, patch: Partial<Block>) => {
    if (!guard()) return
    const yArray = yArrayRef.current
    const doc = docRef.current
    if (!yArray || !doc) return
    const m = yArray.get(i) as Y.Map<unknown>
    doc.transact(() => {
      for (const [k, v] of Object.entries(patch)) m.set(k, v)
    }, agentOrigin())
  }

  const addAfter = (i: number, type: Block["type"] = "p") => {
    if (!guard()) return
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
    if (!guard()) return
    const yArray = yArrayRef.current
    const doc = docRef.current
    if (!yArray || !doc || yArray.length <= 1) return
    doc.transact(() => {
      yArray.delete(i, 1)
    }, agentOrigin())
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, i: number) => {
    if (readOnly) return
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

  if (!ready) {
    return (
      <div className="mx-auto w-full max-w-[720px] py-12 text-center text-[13px] text-white/30">
        Loading document…
      </div>
    )
  }

  if (blocks.length === 0) {
    return (
      <div className="mx-auto w-full max-w-[720px] py-8">
        {readOnly ? (
          <div className="py-12 text-center text-[13px] text-white/30">This document is empty.</div>
        ) : (
          <button
            onClick={() => addAfter(-1)}
            className="w-full rounded-xl border border-dashed border-white/10 py-10 text-[13px] text-white/35 hover:border-white/20 hover:bg-white/[0.02] hover:text-white/60"
          >
            Start writing — click here or press Enter
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <div className="flex flex-col gap-1">
        {blocks.map((b, i) => (
          <div key={b.id} className="group flex items-start gap-2">
            {!readOnly && (
              <button
                onClick={() => addAfter(i)}
                className="mt-1 hidden h-6 w-6 shrink-0 items-center justify-center rounded text-white/20 hover:bg-white/[0.06] hover:text-white/60 group-hover:flex"
              >
                +
              </button>
            )}
            <div className="min-w-0 flex-1">
              {b.type === "todo" ? (
                <label className="flex items-start gap-2 py-1.5">
                  <input
                    type="checkbox"
                    checked={!!b.checked}
                    disabled={readOnly}
                    onChange={(e) => update(i, { checked: e.target.checked })}
                    className="mt-1 h-4 w-4 shrink-0 rounded border border-white/20 bg-transparent accent-white"
                  />
                  <div
                    id={`block-${b.id}`}
                    contentEditable={!readOnly}
                    suppressContentEditableWarning
                    onInput={(e) => update(i, { text: (e.target as HTMLDivElement).innerText })}
                    onKeyDown={(e) => onKeyDown(e, i)}
                    data-placeholder={b.text === "" ? "To-do" : undefined}
                    className={`min-w-0 flex-1 outline-none empty:before:text-white/25 empty:before:content-[attr(data-placeholder)] ${b.checked ? "text-white/30 line-through" : "text-white/80"} ${slash.open && slash.idx === i ? "ring-1 ring-white/10" : ""}`}
                  >
                    {b.text}
                  </div>
                </label>
              ) : (
                <div
                  id={`block-${b.id}`}
                  contentEditable={!readOnly}
                  suppressContentEditableWarning
                  onInput={(e) => update(i, { text: (e.target as HTMLDivElement).innerText })}
                  onKeyDown={(e) => onKeyDown(e, i)}
                  data-placeholder={b.text === "" ? (b.type === "h1" ? "Untitled" : "Type '/' for commands") : undefined}
                  className={`w-full rounded-lg px-3 py-1.5 outline-none focus:bg-white/[0.03] empty:before:text-white/25 empty:before:content-[attr(data-placeholder)] ${
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
              {!readOnly && slash.open && slash.idx === i && (
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
    </div>
  )
}
