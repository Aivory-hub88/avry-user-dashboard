"use client"

import { useState, useRef } from "react"
import { Sparkles, Send, LoaderCircle, FileText, Check, Copy, Wand2 } from "lucide-react"
import { streamConsoleResponse } from "@/lib/streaming"
import WorkspaceCollapsible from "./WorkspaceCollapsible"

type Props = {
  docId: string
  pageTitle: string
  pageIcon: string | null
  tags: Array<{ label: string }>
  canWrite: boolean
  // Optional: full block text extracted from editor (concatenated headings/paragraphs)
  docText?: string
  onInsertBlock?: (text: string) => void
  defaultCollapsed?: boolean
}

const SESSION_KEY = "aivory:ai-panel:session"

function getSessionId() {
  if (typeof window === "undefined") return "ws-ai-panel"
  let sid = localStorage.getItem(SESSION_KEY)
  if (!sid) {
    sid = `ws-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`
    localStorage.setItem(SESSION_KEY, sid)
  }
  return sid
}

export default function WorkspaceAIPanel({ docId, pageTitle, pageIcon, tags, canWrite, docText, onInsertBlock, defaultCollapsed = false }: Props) {
  void docId
  const [prompt, setPrompt] = useState("")
  const [answer, setAnswer] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const buildContext = () => {
    const parts: string[] = []
    parts.push(`Workspace page: "${pageTitle || "Untitled"}" ${pageIcon ?? ""}`.trim())
    if (tags.length) parts.push(`Tags: ${tags.map((t) => t.label).join(", ")}`)
    if (docText && docText.trim()) parts.push(`Page content:\n${docText.slice(0, 4000)}`)
    else parts.push("Page content: (empty or not loaded — summarise based on title/tags)")
    return parts.join("\n")
  }

  const run = async (instruction: string) => {
    if (busy) return
    setBusy(true)
    setError(null)
    setAnswer("")
    const context = buildContext()
    const fullPrompt = `${instruction}\n\n--- Context ---\n${context}`.trim()
    try {
      const sessionId = getSessionId()
      let acc = ""
      for await (const ev of streamConsoleResponse("/api/console/stream", {
        session_id: sessionId,
        organization_id: "default",
        messages: [{ role: "user", content: fullPrompt }],
      })) {
        if (ev.type === "chunk" && typeof ev.content === "string") {
          // streaming.ts typewriter emits cumulative content — use latest
          acc = ev.content
          setAnswer(acc)
        } else if (ev.type === "error") {
          setError(ev.error ?? "AI error")
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI error")
    }
    setBusy(false)
  }

  const onSummarise = () => run("Summarise this workspace page in 5 bullet points. Then suggest 3 concrete next actions as a checklist. Keep it concise and in English unless the page is Indonesian.")
  const onImprove = () => run("Improve the writing of this page: fix grammar, make headings clearer, and suggest a better structure. Return the improved text plus 2-3 edit suggestions.")
  const onSend = () => {
    const t = prompt.trim()
    if (!t) return
    run(t)
    setPrompt("")
  }

  const copy = async () => {
    try { await navigator.clipboard.writeText(answer) } catch {}
  }

  const insert = () => {
    if (!answer.trim() || !canWrite || !onInsertBlock) return
    onInsertBlock(answer.trim().slice(0, 4000))
  }

  return (
    <WorkspaceCollapsible
      title="Cerveau AI"
      icon={<Sparkles className="h-3.5 w-3.5 text-violet-300" />}
      summary="for this page"
      defaultCollapsed={defaultCollapsed}
    >
      <div className="flex flex-wrap gap-1.5">
        <button onClick={onSummarise} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white/[0.04] px-3 py-1.5 text-[11px] text-white/60 hover:bg-white/[0.08] disabled:opacity-40">
          {busy ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />} Summarise
        </button>
        <button onClick={onImprove} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white/[0.04] px-3 py-1.5 text-[11px] text-white/60 hover:bg-white/[0.08] disabled:opacity-40">
          <Wand2 className="h-3 w-3" /> Improve
        </button>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend() } }}
          placeholder="Ask Cerveau about this page…"
          className="flex-1 rounded-full border border-line bg-white/[0.04] px-3 py-2 text-[12px] text-white/80 placeholder:text-white/25 outline-none"
        />
        <button onClick={onSend} disabled={busy || !prompt.trim()} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-2 text-[12px] font-medium text-black hover:bg-white/90 disabled:opacity-40">
          <Send className="h-3.5 w-3.5" /> Send
        </button>
      </div>
      {(answer || busy || error) && (
        <div className="mt-3 rounded-xl border border-line bg-[#1e1e1c] p-3">
          {error && <div className="text-[12px] text-red-300">{error}</div>}
          {busy && !answer && <div className="inline-flex items-center gap-1.5 text-[12px] text-white/40"><LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Thinking…</div>}
          {answer && <div className="whitespace-pre-wrap text-[12px] leading-relaxed text-white/80">{answer}</div>}
          {answer && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              <button onClick={copy} className="inline-flex items-center gap-1 rounded-full border border-line bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/60 hover:bg-white/[0.08]"><Copy className="h-3 w-3" /> Copy</button>
              {canWrite && onInsertBlock && (
                <button onClick={insert} className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-[11px] font-medium text-black hover:bg-white/90"><Check className="h-3 w-3" /> Insert as block</button>
              )}
            </div>
          )}
        </div>
      )}
      <div className="mt-2 text-[11px] text-white/25">Powered by Cerveau via <span className="text-white/40">/api/console/stream</span> · no extra deps</div>
    </WorkspaceCollapsible>
  )
}
