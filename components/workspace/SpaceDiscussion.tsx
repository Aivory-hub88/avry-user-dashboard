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

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"
import { collabAuthHeaders } from "@/lib/collabClient"
import { useWorkspaceAwareness } from "@/hooks/useWorkspaceAwareness"
import { useDiscussionResource } from "@/hooks/useDiscussionResource"
import { useAgentMention } from "@/hooks/useAgentMention"
import { AgentAvatar } from "@/components/office/AgentAvatar"
import { candidateOf, type MentionCandidate } from "@/lib/agentMentions"
import { AGENT_ROSTER } from "@/lib/agentRoster"
import { timeAgo, MENU_POPOVER_CLASS, COMPOSER_STICKY_CLASS, PRESENCE_RING_CLASS, placeMenu } from "@/lib/spaceUi"
import SpaceAgentPanel from "@/components/workspace/SpaceAgentPanel"
import SpaceActivityPanel from "@/components/workspace/SpaceActivityPanel"
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

function initials(name: string): string {
  const clean = name.trim()
  return clean ? clean.slice(0, 1).toUpperCase() : "?"
}

function displayName(m: SpaceMessage): string {
  if (m.author.actingMode === "agent") return m.author.agentName || m.author.agentType || "Agent"
  return m.author.agentName || m.author.memberId
}

/** Render body: token link → chip; nama polos (@Geno/@here) → chip juga. */
const AGENT_NAMES_PATTERN = AGENT_ROSTER.map((a) =>
  a.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
).join("|")
const PLAIN_CHIP_RE = new RegExp(`@(${AGENT_NAMES_PATTERN}|here|all|everyone|team)\\b`, "gi")
const AGENT_NAME_SET = new Set(AGENT_ROSTER.map((a) => a.name.toLowerCase()))

function chipPlain(text: string, keyBase: number): React.ReactNode[] {
  const out: React.ReactNode[] = []
  let last = 0
  let k = 0
  PLAIN_CHIP_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = PLAIN_CHIP_RE.exec(text)) !== null) {
    if (m.index > last) out.push(<span key={`${keyBase}-${k++}`}>{text.slice(last, m.index)}</span>)
    const isAgent = AGENT_NAME_SET.has(m[1].toLowerCase())
    out.push(
      <span
        key={`${keyBase}-${k++}`}
        className={`inline-block rounded-full border px-2 py-px text-[12px] ${
          isAgent
            ? "border-violet-500/30 bg-violet-500/20 text-violet-200"
            : "border-white/10 bg-white/[0.08] text-white/75"
        }`}
      >
        @{m[1]}
      </span>,
    )
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(<span key={`${keyBase}-${k++}`}>{text.slice(last)}</span>)
  if (out.length === 0) out.push(<span key={`${keyBase}-0`}>{text}</span>)
  return out
}

function RichBody({ body }: { body: string }) {
  const parts: { key: number; node: React.ReactNode }[] = []
  let last = 0
  let k = 0
  TOKEN_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = TOKEN_RE.exec(body)) !== null) {
    if (m.index > last) {
      for (const n of chipPlain(body.slice(last, m.index), k)) {
        parts.push({ key: k++, node: n })
      }
    }
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
  if (last < body.length) {
    for (const n of chipPlain(body.slice(last), k)) {
      parts.push({ key: k++, node: n })
    }
  }
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
          {m.body ? <RichBody body={m.body} /> : <span className="italic text-white/30">(deleted)</span>}
        </div>
      </div>
    </div>
  )
}

type DocPick = { label: string; token: string }
type Draft = { text: string; sending: boolean; error: string | null }
type Drafts = Record<string, Draft>
const EMPTY_DRAFT: Draft = { text: "", sending: false, error: null }
type DiscussionProps = {
  spaceId: string
  workspaceId: string | null
  initialThread: string | null
  canWrite: boolean
}

/**
 * Composer ala Room (Mission Control): ketik @ → menu avatar + keyboard
 * (↑/↓/Enter/Tab/Esc, pola ChatInput), sisipkan `@Nama ` polos — readable,
 * server men-stamp by name. Dropdown fixed + flip (anti-kepotong scroll).
 */
function Composer({
  placeholder,
  disabled,
  spaceId,
  docs,
  onSent,
  threadRoot,
  draft,
  updateDraft,
}: {
  draft: Draft
  updateDraft: (update: Partial<Draft>) => void
  spaceId: string
  placeholder: string
  disabled: boolean
  docs: DocOption[]
  onSent: () => void
  threadRoot: string | null
}) {
  const { text, sending, error: sendError } = draft
  const setText = useCallback((text: string) => updateDraft({ text }), [updateDraft])
  const [hashNeedle, setHashNeedle] = useState<string | null>(null)
  const [hashIndex, setHashIndex] = useState(0)
  const [pickPos, setPickPos] = useState<{ top?: number; bottom?: number; left: number; width: number } | null>(null)
  const boxRef = useRef<HTMLTextAreaElement>(null)

  const candidates = useMemo<MentionCandidate[]>(
    () =>
      AGENT_ROSTER.map((a) => candidateOf(a.type)).filter(
        (c): c is MentionCandidate => c !== null,
      ),
    [],
  )
  const mention = useAgentMention({ textareaRef: boxRef, candidates, enabled: !disabled })

  const hashOptions: DocPick[] =
    hashNeedle === null
      ? []
      : docs
          .filter((d) => d.title.toLowerCase().includes(hashNeedle) || d.id.includes(hashNeedle))
          .slice(0, 8)
          .map((d) => ({ label: d.title, token: `[#${d.title}](#doc:${d.id})` }))

  const hereRow = mention.menuOpen && mention.mentionList.length === 0 && "here".includes(mention.mentionQuery)
  const menuVisible = !disabled && (mention.menuOpen || hashNeedle !== null)

  // Fixed + flip: anchor textarea, buka ke atas bila ruang cukup.
  // Scroll/resize = REPOSISI, bukan tutup (menutup saat scroll membuat menu
  // mati seketika di browser: focus scroll-into-view, layout shift dari poll,
  // sticky re-stick — bug 2026-09-17).
  useEffect(() => {
    if (!menuVisible) {
      setPickPos(null)
      return
    }
    let raf = 0
    const place = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const el = boxRef.current
        if (!el) {
          setPickPos(null)
          return
        }
        const r = el.getBoundingClientRect()
        setPickPos(placeMenu(r, window.innerWidth, window.innerHeight))
      })
    }
    place()
    window.addEventListener("scroll", place, true)
    window.addEventListener("resize", place)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("scroll", place, true)
      window.removeEventListener("resize", place)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuVisible])

  const updateHash = useCallback((value: string, cursor: number) => {
    const m = /#([\w-]*)$/.exec(value.slice(0, cursor))
    // # hanya bila @ tidak aktif (hook @ yang menang bila keduanya cocok).
    setHashNeedle(m ? m[1].toLowerCase() : null)
    setHashIndex(0)
  }, [])

  const insertAtCursor = useCallback(
    (insert: string, tokenLen: number) => {
      const el = boxRef.current
      const cursor = el?.selectionStart ?? text.length
      const before = text.slice(0, cursor).slice(0, cursor - tokenLen)
      const next = `${before}${insert}${text.slice(cursor)}`
      setText(next)
      mention.closeMenu()
      setHashNeedle(null)
      requestAnimationFrame(() => {
        el?.focus()
        try {
          el?.setSelectionRange(before.length + insert.length, before.length + insert.length)
        } catch {
          // abaikan
        }
      })
    },
    [text, mention, setText],
  )

  const selectMention = useCallback(
    (c: MentionCandidate) => {
      const el = boxRef.current
      const caret = el?.selectionStart ?? text.length
      const applied = mention.applyMention(c, text, caret)
      if (!applied) {
        mention.closeMenu()
        return
      }
      setText(applied.text)
      mention.closeMenu()
      setHashNeedle(null)
      mention.focusAndRestore(applied.caret)
    },
    [text, mention, setText],
  )

  const selectHere = useCallback(() => {
    const el = boxRef.current
    const caret = el?.selectionStart ?? text.length
    const m = /(^|\s)@([A-Za-z0-9_]*)$/.exec(text.slice(0, caret))
    if (!m) return
    const tokenStart = caret - m[2].length - 1
    insertAtCursor("@here ", caret - tokenStart)
  }, [text, insertAtCursor])

  const selectDoc = useCallback(
    (d: DocPick) => {
      const el = boxRef.current
      const caret = el?.selectionStart ?? text.length
      const m = /#([\w-]*)$/.exec(text.slice(0, caret))
      if (!m) return
      insertAtCursor(`${d.token} `, m[1].length + 1)
    },
    [text, insertAtCursor],
  )

  const send = useCallback(async () => {
    const body = text.trim()
    if (!body || sending || disabled) return
    updateDraft({ sending: true, error: null })
    try {
      const r = await fetch(`/api/workspace/${spaceId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...collabAuthHeaders() },
        body: JSON.stringify({ threadRoot, body }),
      })
      if (!r.ok) throw new Error("Could not send message")
      updateDraft({ text: "", error: null })
      mention.closeMenu()
      setHashNeedle(null)
      onSent()
    } catch {
      updateDraft({ error: "Could not send message. Try again." })
    } finally {
      updateDraft({ sending: false })
    }
  }, [text, sending, disabled, threadRoot, onSent, spaceId, mention, updateDraft])

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Prioritas 1: menu @ ala Room.
    if (mention.menuOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault()
        const n = mention.mentionList.length + (hereRow ? 1 : 0)
        if (n > 0) {
          mention.setMentionIndex(
            (mention.mentionIndex + (e.key === "ArrowDown" ? 1 : -1) + n) % n,
          )
        }
        return
      }
      if (e.key === "Enter" || e.key === "Tab") {
        const pickAgent = mention.mentionList[mention.mentionIndex]
        if (pickAgent) {
          e.preventDefault()
          selectMention(pickAgent)
          return
        }
        if (hereRow) {
          e.preventDefault()
          selectHere()
          return
        }
      }
      if (e.key === "Escape") {
        e.preventDefault()
        mention.closeMenu()
        return
      }
    }
    // Prioritas 2: menu # doc.
    if (hashNeedle !== null && hashOptions.length > 0 && !mention.menuOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault()
        const n = hashOptions.length
        setHashIndex((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + n) % n)
        return
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault()
        selectDoc(hashOptions[hashIndex] ?? hashOptions[0])
        return
      }
      if (e.key === "Escape") {
        e.preventDefault()
        setHashNeedle(null)
        return
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  const showHereRow = hereRow && !disabled

  return (
    <div>
      {menuVisible && pickPos && !disabled && (
        <div
          role="listbox"
          aria-label="Mention"
          className={MENU_POPOVER_CLASS}
          style={{
            left: pickPos.left,
            width: pickPos.width,
            ...(pickPos.bottom !== undefined ? { bottom: pickPos.bottom } : { top: pickPos.top }),
          }}
        >
          {mention.menuOpen && (
            <>
              {mention.mentionList.map((c, i) => (
                <button
                  key={c.type}
                  role="option"
                  aria-selected={i === mention.mentionIndex}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    selectMention(c)
                  }}
                  onMouseEnter={() => mention.setMentionIndex(i)}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left ${
                    i === mention.mentionIndex ? "bg-white/[0.08]" : ""
                  }`}
                >
                  <AgentAvatar type={c.type} size={28} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-white/85">
                      {c.name}
                    </span>
                    <span className="block truncate text-[11px] text-white/40">{c.title}</span>
                  </span>
                </button>
              ))}
              {showHereRow && (
                <button
                  onMouseDown={(e) => {
                    e.preventDefault()
                    selectHere()
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left ${
                    mention.mentionIndex === mention.mentionList.length ? "bg-white/[0.08]" : ""
                  }`}
                >
                  <span className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[13px] font-bold text-white/70">
                    @
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-white/85">@here</span>
                    <span className="block truncate text-[11px] text-white/40">all members</span>
                  </span>
                </button>
              )}
              {mention.mentionList.length === 0 && !showHereRow && (
                <div className="px-2.5 py-2 text-[12px] text-white/40">
                  <span>No matching agent — try another name or @here.</span>
                </div>
              )}
            </>
          )}
          {hashNeedle !== null && !mention.menuOpen && (
            <>
              {hashOptions.map((d, i) => (
                <button
                  key={d.token}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    selectDoc(d)
                  }}
                  onMouseEnter={() => setHashIndex(i)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] text-white/70 hover:bg-white/[0.06] hover:text-white ${
                    i === hashIndex ? "bg-white/[0.08]" : ""
                  }`}
                >
                  <span className="truncate">{d.label}</span>
                </button>
              ))}
              {hashOptions.length === 0 && (
                <div className="px-2.5 py-2 text-[12px] text-white/40">
                  <span>No matching docs.</span>
                </div>
              )}
            </>
          )}
        </div>
      )}
      <div className="flex items-end gap-2 rounded-2xl border border-line bg-white/[0.03] p-2 pl-3">
        <textarea
          ref={boxRef}
          value={text}
          disabled={disabled || sending}
          onChange={(e) => {
            const next = e.target.value
            const caret = e.target.selectionStart ?? next.length
            setText(next)
            mention.checkForMention(next, caret)
            updateHash(next, caret)
          }}
          onKeyDown={onKeyDown}
          placeholder={disabled ? "Viewers can't write" : placeholder}
          rows={2}
          className="max-h-[160px] min-h-[40px] flex-1 resize-y bg-transparent text-[13px] leading-[1.6] text-white/85 outline-none placeholder:text-white/25 disabled:opacity-50"
        />
        <button
          onClick={() => void send()}
          disabled={disabled || sending || !text.trim()}
          className="shrink-0 rounded-full bg-white px-4 py-1.5 text-[12px] font-medium text-black hover:bg-white/90 disabled:opacity-40"
        >
          {sending ? "…" : "Send"}
        </button>
      </div>
      {sendError && <div role="alert" className="mt-1 text-[12px] text-red-300">{sendError}</div>}
      <div className="mt-1 px-1 text-[11px] text-white/25">
        <span>@ pick an agent · # pick a doc · Enter to send, Shift+Enter for new line</span>
      </div>
    </div>
  )
}

export default function SpaceDiscussion(props: DiscussionProps) {
  return <DiscussionSpace key={props.spaceId} {...props} />
}

function DiscussionSpace({ spaceId, workspaceId, initialThread, canWrite }: DiscussionProps) {
  const router = useRouter()
  const peers = useWorkspaceAwareness(workspaceId)
  const [openRoot, setOpenRoot] = useState<string | null>(initialThread)
  const [lastInitialThread, setLastInitialThread] = useState(initialThread)
  const [panelTab, setPanelTab] = useState<"thread" | "activity">("thread")
  if (lastInitialThread !== initialThread) {
    setLastInitialThread(initialThread)
    setOpenRoot(initialThread)
    setPanelTab("thread")
  }
  const stream = useDiscussionResource<{ roots: RootItem[] }>(`/api/workspace/${spaceId}/stream?limit=50`)
  const threadResource = useDiscussionResource<ThreadPayload>(openRoot
    ? `/api/workspace/${spaceId}/thread?root=${encodeURIComponent(openRoot)}` : null)
  const roots = Array.isArray(stream.data?.roots) ? stream.data.roots : []
  const loading = stream.loading
  const loadError = stream.error ? "Could not load discussion." : null
  const thread = threadResource.data?.root.id === openRoot ? threadResource.data : null
  const threadLoading = threadResource.loading
  const loadStream = stream.refresh
  const loadThread = threadResource.refresh
  const [docs, setDocs] = useState<DocOption[]>([])
  const [drafts, setDrafts] = useState<Drafts>({})
  const [topicDrafts, setTopicDrafts] = useState<Drafts>({})
  const draftKey = JSON.stringify(openRoot)
  const topicDraft = topicDrafts[draftKey]?.text ?? ""
  const topicBusy = topicDrafts[draftKey]?.sending ?? false
  const updateReply = useCallback((update: Partial<Draft>) => {
    setDrafts((prev) => ({ ...prev, [draftKey]: { ...(prev[draftKey] ?? EMPTY_DRAFT), ...update } }))
  }, [draftKey])
  const updateRoot = useCallback((update: Partial<Draft>) => {
    setDrafts((prev) => ({ ...prev, null: { ...(prev.null ?? EMPTY_DRAFT), ...update } }))
  }, [])
  const updateTopic = useCallback((update: Partial<Draft>) => {
    setTopicDrafts((prev) => ({ ...prev, [draftKey]: { ...(prev[draftKey] ?? EMPTY_DRAFT), ...update } }))
  }, [draftKey])
  const visibleRoot = useRef<string | null>(openRoot)
  useEffect(() => {
    visibleRoot.current = openRoot
    return () => { visibleRoot.current = null }
  }, [openRoot])

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

  const openThread = useCallback(
    (rootId: string, targetSpace = spaceId) => {
      if (targetSpace !== spaceId) {
        router.push(`/workspace/${encodeURIComponent(targetSpace)}?view=discussion&thread=${encodeURIComponent(rootId)}`)
        return
      }
      setOpenRoot(rootId)
      setPanelTab("thread")
      router.replace(`/workspace/${spaceId}?view=discussion&thread=${encodeURIComponent(rootId)}`, { scroll: false })
    },
    [router, spaceId],
  )

  const closeThread = useCallback(() => {
    setOpenRoot(null)
    router.replace(`/workspace/${spaceId}?view=discussion`, { scroll: false })
  }, [router, spaceId])

  const [confirmDeleteRoot, setConfirmDeleteRoot] = useState<string | null>(null)
  const [deletingRoot, setDeletingRoot] = useState<string | null>(null)

  const refreshAll = useCallback(() => {
    void loadStream()
    void loadThread()
  }, [loadStream, loadThread])

  const deleteRoot = useCallback(
    async (rootId: string) => {
      if (deletingRoot) return
      setDeletingRoot(rootId)
      try {
        const r = await fetch(
          `/api/workspace/${spaceId}/thread?root=${encodeURIComponent(rootId)}`,
          { method: "DELETE", headers: collabAuthHeaders() },
        )
        if (r.ok) {
          if (visibleRoot.current === rootId) closeThread()
          setConfirmDeleteRoot(null)
          refreshAll()
        }
      } catch {
        // diam
      }
      setDeletingRoot(null)
    },
    [spaceId, closeThread, refreshAll, deletingRoot],
  )

  const saveTopic = useCallback(async () => {
    const title = topicDraft.trim()
    if (!title || !openRoot || topicBusy) return
    updateTopic({ sending: true, error: null })
    try {
      const r = await fetch(`/api/workspace/${spaceId}/topics`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...collabAuthHeaders() },
        body: JSON.stringify({ rootMessageId: openRoot, title }),
      })
      if (r.ok) {
        updateTopic({ text: "" })
        refreshAll()
      }
    } catch {
      // diam
    }
    updateTopic({ sending: false })
  }, [topicDraft, openRoot, topicBusy, spaceId, refreshAll, updateTopic])

  const toggleArchive = useCallback(async () => {
    if (!thread?.topic || topicBusy) return
    updateTopic({ sending: true, error: null })
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
    updateTopic({ sending: false })
  }, [thread, topicBusy, spaceId, refreshAll, updateTopic])

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
                  className={`flex h-[26px] w-[26px] items-center justify-center rounded-full border-2 ${PRESENCE_RING_CLASS} text-[11px] font-bold text-white/70`}
                  style={{ backgroundColor: p.color || "rgba(255,255,255,.08)", marginLeft: i === 0 ? 0 : -7 }}
                >
                  {initials(p.name)}
                </span>
              ))}
            </span>
          )}
        </div>
        {loading && <span className="text-[13px] text-white/40">Loading discussion…</span>}
        {loadError && <span className="text-[13px] text-white/40">{loadError}</span>}
        {!loading && !loadError && roots.length === 0 && (
          <div className="rounded-2xl border border-line bg-white/[0.03] p-8 text-center">
            <div className="text-[14px] font-medium text-white/70">No discussion yet</div>
            <div className="mt-1 text-[12px] text-white/35">Write the first root message below.</div>
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
              <div className="mt-2 flex items-center gap-3 pl-[44px]">
                <button
                  onClick={() => openThread(r.id)}
                  className="text-[12px] text-white/40 hover:text-white/75"
                >
                  {r.replyCount > 0 ? `${r.replyCount} ${r.replyCount === 1 ? "reply" : "replies"} →` : "Open thread →"}
                </button>
                {canWrite && (
                  confirmDeleteRoot === r.id ? (
                    <span className="flex items-center gap-1.5">
                      <button
                        onClick={() => void deleteRoot(r.id)}
                        disabled={deletingRoot === r.id}
                        title="Delete this thread and its replies"
                        className="rounded bg-red-500/15 p-1 text-red-300 disabled:opacity-40"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => void deleteRoot(r.id)}
                        disabled={deletingRoot === r.id}
                        className="text-[11px] font-medium text-red-300 hover:text-red-200 disabled:opacity-40"
                      >
                        {deletingRoot === r.id ? "…" : "Sure?"}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteRoot(null)}
                        className="text-[11px] text-white/40 hover:text-white/70"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteRoot(r.id)}
                      title="Delete this thread and its replies"
                      className="rounded p-1 text-white/25 hover:text-red-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
        <div className={COMPOSER_STICKY_CLASS}>
          <Composer
            draft={drafts.null ?? EMPTY_DRAFT}
            updateDraft={updateRoot}
            spaceId={spaceId}
            placeholder="Write an update… @ for agents, # for docs"
            disabled={!canWrite}
            docs={docs}
            threadRoot={null}
            onSent={refreshAll}
          />
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
          <span className="text-[12px] text-white/35">Select a thread from the stream to open it here.</span>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between">
            <span className="text-[13px] font-medium text-white/75">
              {thread?.topic && !thread.topic.archived ? thread.topic.title : "Thread"}
            </span>
            <span className="flex items-center gap-3">
              {canWrite && openRoot && (
                confirmDeleteRoot === openRoot ? (
                  <span className="flex items-center gap-1.5">
                    <button
                      onClick={() => void deleteRoot(openRoot)}
                      disabled={deletingRoot === openRoot}
                      title="Delete this thread and its replies"
                      className="rounded bg-red-500/15 p-1 text-red-300 disabled:opacity-40"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => void deleteRoot(openRoot)}
                      disabled={deletingRoot === openRoot}
                      className="text-[11px] font-medium text-red-300 hover:text-red-200 disabled:opacity-40"
                    >
                      {deletingRoot === openRoot ? "…" : "Sure?"}
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteRoot(openRoot)}
                    title="Delete this thread and its replies"
                    className="rounded p-1 text-white/25 hover:text-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )
              )}
              <button onClick={closeThread} className="text-[12px] text-white/40 hover:text-white/75">
                Close
              </button>
            </span>
          </div>
          {thread?.topic?.archived && (
            <div className="mb-3 rounded-xl border border-line bg-white/[0.03] px-3 py-2 text-[12px] text-white/45">
              <span>Archived — a new reply will reopen it.</span>
            </div>
          )}
          <SpaceAgentPanel
            key={`${spaceId}:${openRoot}`}
            spaceId={spaceId}
            threadRoot={openRoot}
            canWrite={canWrite}
            onChanged={refreshAll}
          />
          {threadLoading && <span className="text-[12px] text-white/40">Loading thread…</span>}
          {!threadLoading && !thread && (
            <span className="text-[12px] text-white/40">Thread not found.</span>
          )}
          {thread && (
            <div className="flex flex-col gap-5">
              <MessageRow m={thread.root} />
              <div className="border-t border-line" />
              {thread.replies.map((m) => (
                <MessageRow key={m.id} m={m} />
              ))}
              {thread.replies.length === 0 && (
                <span className="text-[12px] text-white/35">No replies yet.</span>
              )}
            </div>
          )}
          <div className="mt-4 border-t border-line pt-3">
            {canWrite && thread && !thread.topic && (
              <div className="mb-3 flex items-center gap-2">
                <input
                  value={topicDraft}
                  onChange={(e) => updateTopic({ text: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void saveTopic()
                  }}
                  placeholder="Thread goal title…"
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
                  {thread.topic.archived ? "Unarchive" : "Archive"}
                </button>
              </div>
            )}
            <Composer
              key={openRoot}
              draft={drafts[draftKey] ?? EMPTY_DRAFT}
              updateDraft={updateReply}
              spaceId={spaceId}
              placeholder="Reply… @ for agents"
              disabled={!canWrite || !thread || threadResource.error}
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
