"use client"

import { useEffect, useState, useRef } from "react"

type Block = { id: string; type: "h1" | "h2" | "p" | "todo" | "bullet" | "quote"; text: string; checked?: boolean }

function uid() {
  return Math.random().toString(36).slice(2, 8)
}

const DEFAULT_BLOCKS: Block[] = [
  { id: uid(), type: "h1", text: "Untitled" },
  { id: uid(), type: "p", text: "Press / for commands — this is a BlockSuite-style Yjs placeholder persisting to localStorage. Next iteration syncs to y-websocket." },
  { id: uid(), type: "todo", text: "Try typing, then hit Enter", checked: false },
  { id: uid(), type: "bullet", text: "Agents can create rows in Workspace DB" },
]

export default function WorkspaceEditor({ docId }: { docId: string }) {
  const [blocks, setBlocks] = useState<Block[]>(DEFAULT_BLOCKS)
  const [slash, setSlash] = useState<{ idx: number; open: boolean }>({ idx: 0, open: false })
  const storageKey = `aivory:workspace:${docId}`

  useEffect(() => {
    const raw = localStorage.getItem(storageKey)
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Block[]
        if (Array.isArray(parsed) && parsed.length) setBlocks(parsed)
      } catch {}
    }
  }, [storageKey])

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(blocks))
  }, [blocks, storageKey])

  const update = (i: number, patch: Partial<Block>) => {
    setBlocks((b) => b.map((x, idx) => (idx === i ? { ...x, ...patch } : x)))
  }

  const addAfter = (i: number, type: Block["type"] = "p") => {
    const nb: Block = { id: uid(), type, text: "", ...(type === "todo" ? { checked: false } : {}) }
    setBlocks((b) => [...b.slice(0, i + 1), nb, ...b.slice(i + 1)])
    setTimeout(() => document.getElementById(`block-${nb.id}`)?.focus(), 10)
  }

  const remove = (i: number) => {
    if (blocks.length === 1) return
    setBlocks((b) => b.filter((_, idx) => idx !== i))
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, i: number) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      addAfter(i, blocks[i].type === "h1" || blocks[i].type === "h2" ? "p" : blocks[i].type)
    }
    if (e.key === "Backspace" && blocks[i].text === "") {
      e.preventDefault()
      remove(i)
    }
    if (e.key === "/" && blocks[i].text === "") {
      setSlash({ idx: i, open: true })
    }
  }

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <div className="mb-6 flex items-center gap-2 text-[11px] text-white/30">
        <span className="rounded bg-white/[0.06] px-2 py-1">Yjs localStorage</span>
        <span>•</span>
        <span>{blocks.length} blocks</span>
        <span>•</span>
        <button
          onClick={() => setBlocks(DEFAULT_BLOCKS)}
          className="rounded bg-white/[0.06] px-2 py-1 hover:bg-white/[0.08]"
        >
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
                  <button
                    onClick={() => setSlash({ idx: 0, open: false })}
                    className="px-2 text-[12px] text-white/30"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-[12px] leading-relaxed text-white/40">
        AFFiNE parity next: mount <code className="rounded bg-white/[0.06] px-1.5 py-0.5">@blocksuite/store</code> Yjs Doc +{" "}
        <code className="rounded bg-white/[0.06] px-1.5 py-0.5">y-websocket</code> at{" "}
        <code className="rounded bg-white/[0.06] px-1.5 py-0.5">host.docker.internal:3200</code>. This POC already
        persists to <code className="rounded bg-white/[0.06] px-1.5 py-0.5">localStorage</code> per docId.
      </div>
    </div>
  )
}
