/**
 * SpaceDiscussion — mode Discussion di Space view (Phase 2: baca + tulis).
 *
 * Stream root + panel thread + composer (root & reply) + picker @/# +
 * chip render + topic actions (title/archive). Stream kiri tidak reset
 * saat thread dibuka; di-refresh background setelah tulis berhasil.
 *
 * Aturan gaya (SCOPE §5.3–5.4): token existing saja, teks hanya span/div.
 */
"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { collabAuthHeaders } from "@/lib/collabClient"
import { useWorkspaceAwareness } from "@/hooks/useWorkspaceAwareness"
import SpaceAgentPanel from "@/components/workspace/SpaceAgentPanel"
import SpaceActivityPanel from "@/components/workspace/SpaceActivityPanel"
import { AGENT_ROSTER } from "@/lib/agentRoster"
import type { SpaceMessage, SpaceTopic } from "@/lib/spaceProtocol"

type RootItem = SpaceMessage & {
  replyCount: number
  topic: SpaceTopic | null
}

interface ThreadPayload {
  root: SpaceMessage
  replies: SpaceMessage[]
  topic: SpaceTopic | null
}

interface DocOption {
  id: string
  title: string
}

const TOKEN_RE =
  /\[(@[^\[\]\\]+|#[^\[\]\\]+)\]\(#(member:([^\)\s]+)|agent:([^\)\s]+)|here|doc:([^\)\s]+))\)/g

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return ""
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000))
  if (s < 60) return `${s} dtk`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} mnt`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} jam`
  return `${Math.floor(h / 24)} hari`
}

function initials(name: string): string {
  const clean = name.trim()
  return clean ? clean.slice(0, 1).toUpperCase() : "?"
}

function displayName(m: SpaceMessage): string {
  if (m.author.actingMode === "agent") return m.author.agentName || m.author.agentType || "Agent"
  return m.author.agentName || m.author.memberId
}

/** Render body: token link → chip, sisanya teks biasa. */
function RichBody({ body }: { body: string }) {
  const parts: { key: number; node: React.ReactNode }[] = []
  let last = 0
  let k = 0
  TOKEN_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = TOKEN_RE.exec(body)) !== null) {
    if (m.index > last) parts.push({ key: k++, node: body.slice(last, m.index) })
    const label = m[1]
    const target = m[2]
    const tone = target.startsWith("agent:")
      ? "border-violet-500/30 bg-violet-500/20 text-violet-200"
      : "border-white/10 bg-white/[0.08] text-white/75"
    parts.push({
      key: k++,
      node: (
        <span className={`inline-block rounded-full border px-2 py-px text-[12px] ${tone}`}>
          {label}
        </span>
      ),
    })
    last = m.index + m[0].length
  }
  if (last < body.length) parts.push({ key: k++, node: body.slice(last) })
  if (parts.length === 0) return <span>{body}</span>
  return (
    <span>
      {parts.map((p) => (
        <span key={p.key}>{p.node}</span>
      ))}
    </span>
  )
}

function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-white/[0.08] font-semibold text-white/70"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials(name)}
    </span>
  )
}

function MessageRow({ m, topic }: { m: SpaceMessage; topic?: SpaceTopic | null }) {
  const name = displayName(m)
  const isAgent = m.author.actingMode === "agent"
  return (
    <div className="flex gap-3">
      <Avatar name={name} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-medium text-white/85">{name}</span>
          {isAgent && (
            <span className="rounded-full border border-violet-500/30 bg-violet-500/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-violet-200">
              agent
            </span>
          )}
          <span className="text-[11px] tabular-nums text-white/35" title={m.createdAt}>
            {timeAgo(m.createdAt)}
          </span>
        </div>
        {topic && !topic.archived && (
          <div className="mt-1">
            <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-white/60">
              {topic.title}
            </span>
          </div>
        )}
        <div className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-[1.6] text-white/75">
          {m.body ? <RichBody body={m.body} /> : <span className="italic text-white/30">(dihapus)</span>}
        </div>
      </div>
    </div>
  )
}

type AtPick =
  | { kind: "agent"; label: string; token: string }
  | { kind: "here"; label: string; token: string }
  | { kind: "doc"; label: string; token: string }

function Composer({
  placeholder,
  disabled,
  spaceId,
  docs,
  onSent,
  threadRoot,
}: {
  spaceId: string
  placeholder: string
  disabled: boolean
  docs: DocOption[]
  onSent: () => void
  threadRoot: string | null
}) {
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const [pick, setPick] = useState<{ kind: "at" | "hash"; needle: string } | null>(null)
  const boxRef = useRef<HTMLTextAreaElement>(null)

  const updatePick = useCallback((value: string, cursor: number) => {
    const before = value.slice(0, cursor)
    const at = before.match(/@([\w-]*)$/)
    if (at) {
      setPick({ kind: "at", needle: at[1].toLowerCase() })
      return
    }
    const hash = before.match(/#([\w-]*)$/)
    if (hash) {
      setPick({ kind: "hash", needle: hash[1].toLowerCase() })
      return
    }
    setPick(null)
  }, [])

  const agentOptions: AtPick[] =
    pick?.kind === "at"
      ? AGENT_ROSTER.filter(
          (a) => a.name.toLowerCase().includes(pick.needle) || a.type.includes(pick.needle),
        ).map((a) => ({
          kind: "agent" as const,
          label: `${a.name} — ${a.title}`,
          token: `[@${a.name}](#agent:${a.type})`,
        }))
      : []
  const hereOption: AtPick[] =
    pick?.kind === "at" && "here".includes(pick.needle)
      ? [{ kind: "here" as const, label: "@here — semua member", token: "[@here](#here)" }]
      : []
  const atOptions: AtPick[] = [...agentOptions, ...hereOption]
  const hashOptions: AtPick[] =
    pick?.kind === "hash"
      ? docs
          .filter((d) => d.title.toLowerCase().includes(pick.needle) || d.id.includes(pick.needle))
          .slice(0, 8)
          .map((d) => ({ kind: "doc" as const, label: d.title, token: `[#${d.title}](#doc:${d.id})` }))
      : []

  const insertToken = useCallback(
    (token: string) => {
      const el = boxRef.current
      if (!el) {
        setText((t) => `${t}${token} `)
        setPick(null)
        return
      }
      const cursor = el.selectionStart ?? text.length
      const before = text.slice(0, cursor).replace(/[@#][\w-]*$/, "")
      const after = text.slice(cursor)
      const next = `${before}${token} ${after}`
      setText(next)
      setPick(null)
      requestAnimationFrame(() => {
        el.focus()
        const pos = before.length + token.length + 1
        el.setSelectionRange(pos, pos)
      })
    },
    [text],
  )

  const send = useCallback(async () => {
    const body = text.trim()
    if (!body || sending || disabled) return
    setSending(true)
    try {
      const r = await fetch(`/api/workspace/${spaceId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...collabAuthHeaders() },
        body: JSON.stringify({ threadRoot, body }),
      })
      if (r.ok) {
        setText("")
        setPick(null)
        onSent()
      }
    } catch {
      // diam — user bisa coba lagi, draf tidak hilang
    }
    setSending(false)
  }, [text, sending, disabled, threadRoot, onSent, spaceId])

  const options = pick?.kind === "at" ? atOptions : hashOptions

  return (
    <div className="relative">
      {pick && options.length > 0 && !disabled && (
        <div className="absolute bottom-full left-0 z-10 mb-1 max-h-[220px] w-[280px] overflow-y-auto rounded-xl border border-line bg-[#1e1e1c] p-1.5 shadow-2xl">
          {options.map((o) => (
            <button
              key={o.token}
              onMouseDown={(e) => {
                e.preventDefault()
                insertToken(o.token)
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] text-white/70 hover:bg-white/[0.06] hover:text-white"
            >
              <span className="truncate">{o.label}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2 rounded-2xl border border-line bg-white/[0.03] p-2 pl-3">
        <textarea
          ref={boxRef}
          value={text}
          disabled={disabled || sending}
          onChange={(e) => {
            setText(e.target.value)
            updatePick(e.target.value, e.target.selectionStart ?? e.target.value.length)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
            if (e.key === "Escape") setPick(null)
          }}
          placeholder={disabled ? "Viewer tidak bisa menulis" : placeholder}
          rows={2}
          className="max-h-[160px] min-h-[40px] flex-1 resize-y bg-transparent text-[13px] leading-[1.6] text-white/85 outline-none placeholder:text-white/25 disabled:opacity-50"
        />
        <button
          onClick={() => void send()}
          disabled={disabled || sending || !text.trim()}
          className="shrink-0 rounded-full bg-white px-4 py-1.5 text-[12px] font-medium text-black hover:bg-white/90 disabled:opacity-40"
        >
          {sending ? "…" : "Kirim"}
        </button>
      </div>
      <div className="mt-1 px-1 text-[11px] text-white/25">
        <span>@ untuk agent/member · # untuk doc · Enter kirim, Shift+Enter baris baru</span>
      </div>
    </div>
  )
}

export default function SpaceDiscussion({
  spaceId,
  workspaceId,
  initialThread,
  canWrite,
}: {
  spaceId: string
  workspaceId: string | null
  initialThread: string | null
  canWrite: boolean
}) {
  const router = useRouter()
  const peers = useWorkspaceAwareness(workspaceId)
  const [roots, setRoots] = useState<RootItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [openRoot, setOpenRoot] = useState<string | null>(initialThread)
  const [panelTab, setPanelTab] = useState<"thread" | "activity">("thread")
  const [thread, setThread] = useState<ThreadPayload | null>(null)
  const [threadLoading, setThreadLoading] = useState(false)
  const [docs, setDocs] = useState<DocOption[]>([])
  const [topicDraft, setTopicDraft] = useState("")
  const [topicBusy, setTopicBusy] = useState(false)

  const loadStream = useCallback(async () => {
    try {
      const r = await fetch(`/api/workspace/${spaceId}/stream?limit=50`, {
        headers: collabAuthHeaders(),
      })
      if (r.ok) {
        const j = await r.json()
        setRoots(Array.isArray(j.roots) ? j.roots : [])
        setLoadError(null)
      } else {
        setLoadError("Could not load discussion.")
      }
    } catch {
      setLoadError("Could not load discussion.")
    }
    setLoading(false)
  }, [spaceId])

  useEffect(() => {
    setLoading(true)
    void loadStream()
  }, [loadStream])

  useEffect(() => {
    fetch("/api/workspace", { headers: collabAuthHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (Array.isArray(j?.docs)) {
          setDocs(
            j.docs
              .filter((d: { id?: unknown }) => typeof d?.id === "string")
              .map((d: { id: string; title?: unknown }) => ({
                id: d.id,
                title: typeof d.title === "string" && d.title ? d.title : d.id,
              })),
          )
        }
      })
      .catch(() => {})
  }, [])

  const loadThread = useCallback(
    async (rootId: string) => {
      setThreadLoading(true)
      try {
        const r = await fetch(`/api/workspace/${spaceId}/thread?root=${encodeURIComponent(rootId)}`, {
          headers: collabAuthHeaders(),
        })
        setThread(r.ok ? ((await r.json()) as ThreadPayload) : null)
      } catch {
        setThread(null)
      }
      setThreadLoading(false)
    },
    [spaceId],
  )

  const openThread = useCallback(
    (rootId: string) => {
      setOpenRoot(rootId)
      setPanelTab("thread")
      setThread(null)
      router.replace(`/workspace/${spaceId}?view=discussion&thread=${rootId}`, { scroll: false })
      void loadThread(rootId)
    },
    [router, spaceId, loadThread],
  )

  useEffect(() => {
    if (initialThread) {
      setOpenRoot(initialThread)
      void loadThread(initialThread)
    }
    // Hanya deep-link awal — pilihan berikutnya lewat klik.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const closeThread = useCallback(() => {
    setOpenRoot(null)
    setThread(null)
    router.replace(`/workspace/${spaceId}?view=discussion`, { scroll: false })
  }, [router, spaceId])

  const refreshAll = useCallback(() => {
    void loadStream()
    if (openRoot) void loadThread(openRoot)
  }, [loadStream, loadThread, openRoot])

  const saveTopic = useCallback(async () => {
    const title = topicDraft.trim()
    if (!title || !openRoot || topicBusy) return
    setTopicBusy(true)
    try {
      const r = await fetch(`/api/workspace/${spaceId}/topics`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...collabAuthHeaders() },
        body: JSON.stringify({ rootMessageId: openRoot, title }),
      })
      if (r.ok) {
        setTopicDraft("")
        refreshAll()
      }
    } catch {
      // diam
    }
    setTopicBusy(false)
  }, [topicDraft, openRoot, topicBusy, spaceId, refreshAll])

  const toggleArchive = useCallback(async () => {
    if (!thread?.topic || topicBusy) return
    setTopicBusy(true)
    try {
      const r = await fetch(`/api/workspace/${spaceId}/topics/${thread.topic.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...collabAuthHeaders() },
        body: JSON.stringify({ op: thread.topic.archived ? "unarchive" : "archive" }),
      })
      if (r.ok) refreshAll()
    } catch {
      // diam
    }
    setTopicBusy(false)
  }, [thread, topicBusy, spaceId, refreshAll])

  return (
    <div className="mx-auto flex w-full max-w-[1200px] gap-4">
      <div className="min-w-0 flex-1">
        <div className="mb-4 flex items-center gap-3">
          <span className="text-[15px] font-medium text-white/85">Discussion</span>
          {peers.length > 0 && (
            <span className="flex items-center">
              {peers.slice(0, 5).map((p, i) => (
                <span
                  key={`${p.name}-${i}`}
                  title={p.name}
                  className="flex h-[26px] w-[26px] items-center justify-center rounded-full border-2 border-[#18181b] text-[11px] font-bold text-white/70"
                  style={{ backgroundColor: p.color || "rgba(255,255,255,.08)", marginLeft: i === 0 ? 0 : -7 }}
                >
                  {initials(p.name)}
                </span>
              ))}
            </span>
          )}
        </div>
        <div className="mb-5">
          <Composer
            spaceId={spaceId}
            placeholder="Mulai diskusi… @Geno untuk agent, # untuk doc"
            disabled={!canWrite}
            docs={docs}
            threadRoot={null}
            onSent={refreshAll}
          />
        </div>
        {loading && <span className="text-[13px] text-white/40">Loading discussion…</span>}
        {loadError && <span className="text-[13px] text-white/40">{loadError}</span>}
        {!loading && !loadError && roots.length === 0 && (
          <div className="rounded-2xl border border-line bg-white/[0.03] p-8 text-center">
            <div className="text-[14px] font-medium text-white/70">Belum ada diskusi</div>
            <div className="mt-1 text-[12px] text-white/35">Tulis root message pertama di atas.</div>
          </div>
        )}
        <div className="flex flex-col gap-5">
          {roots.map((r) => (
            <div
              key={r.id}
              className={`rounded-2xl border p-4 ${
                openRoot === r.id ? "border-white/15 bg-white/[0.05]" : "border-line bg-white/[0.03]"
              }`}
            >
              <MessageRow m={r} topic={r.topic} />
              <div className="mt-2 pl-[44px]">
                <button
                  onClick={() => openThread(r.id)}
                  className="text-[12px] text-white/40 hover:text-white/75"
                >
                  {r.replyCount > 0 ? `${r.replyCount} ${r.replyCount === 1 ? "reply" : "replies"} →` : "Buka thread →"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div
        className={`${openRoot || panelTab === "activity" ? "flex" : "hidden"} w-full shrink-0 flex-col overflow-y-auto rounded-2xl border border-line bg-white/[0.02] p-4 lg:flex lg:w-[380px] lg:max-w-[380px]`}
      >
        <div className="mb-3 flex items-center gap-1 rounded-full bg-white/[0.04] p-1">
          <button
            onClick={() => setPanelTab("thread")}
            className={`flex-1 rounded-full px-3 py-1 text-[12px] ${panelTab === "thread" ? "bg-white text-black" : "text-white/40 hover:text-white/70"}`}
          >
            Thread
          </button>
          <button
            onClick={() => setPanelTab("activity")}
            className={`flex-1 rounded-full px-3 py-1 text-[12px] ${panelTab === "activity" ? "bg-white text-black" : "text-white/40 hover:text-white/70"}`}
          >
            Activity
          </button>
        </div>
        {panelTab === "activity" ? (
          <SpaceActivityPanel onOpenThread={openThread} />
        ) : !openRoot ? (
          <span className="text-[12px] text-white/35">Pilih thread dari stream untuk dibuka di sini.</span>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between">
            <span className="text-[13px] font-medium text-white/75">
              {thread?.topic && !thread.topic.archived ? thread.topic.title : "Thread"}
            </span>
            <button onClick={closeThread} className="text-[12px] text-white/40 hover:text-white/75">
              Tutup
            </button>
          </div>
          {thread?.topic?.archived && (
            <div className="mb-3 rounded-xl border border-line bg-white/[0.03] px-3 py-2 text-[12px] text-white/45">
              <span>Diarsipkan — reply baru akan membuka lagi.</span>
            </div>
          )}
          <SpaceAgentPanel
            spaceId={spaceId}
            threadRoot={openRoot}
            canWrite={canWrite}
            onChanged={refreshAll}
          />
          {threadLoading && <span className="text-[12px] text-white/40">Loading thread…</span>}
          {!threadLoading && !thread && (
            <span className="text-[12px] text-white/40">Thread tidak ditemukan.</span>
          )}
          {thread && (
            <div className="flex flex-col gap-5">
              <MessageRow m={thread.root} />
              <div className="border-t border-line" />
              {thread.replies.map((m) => (
                <MessageRow key={m.id} m={m} />
              ))}
              {thread.replies.length === 0 && (
                <span className="text-[12px] text-white/35">Belum ada reply.</span>
              )}
            </div>
          )}
          <div className="mt-4 border-t border-line pt-3">
            {canWrite && thread && !thread.topic && (
              <div className="mb-3 flex items-center gap-2">
                <input
                  value={topicDraft}
                  onChange={(e) => setTopicDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void saveTopic()
                  }}
                  placeholder="Judul goal thread ini…"
                  disabled={topicBusy}
                  className="min-w-0 flex-1 rounded-xl border border-line bg-white/[0.03] px-3 py-1.5 text-[12px] text-white/85 outline-none placeholder:text-white/25"
                />
                <button
                  onClick={() => void saveTopic()}
                  disabled={topicBusy || !topicDraft.trim()}
                  className="shrink-0 rounded-full bg-white/[0.08] px-3 py-1.5 text-[12px] text-white/75 hover:bg-white/[0.12] disabled:opacity-40"
                >
                  Title
                </button>
              </div>
            )}
            {canWrite && thread?.topic && (
              <div className="mb-3">
                <button
                  onClick={() => void toggleArchive()}
                  disabled={topicBusy}
                  className="rounded-full bg-white/[0.06] px-3 py-1 text-[11px] text-white/55 hover:bg-white/[0.1] hover:text-white/80 disabled:opacity-40"
                >
                  {thread.topic.archived ? "Buka arsip" : "Arsipkan"}
                </button>
              </div>
            )}
            <Composer
              spaceId={spaceId}
              placeholder="Reply… @ untuk agent"
              disabled={!canWrite}
              docs={docs}
              threadRoot={openRoot}
              onSent={refreshAll}
            />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
