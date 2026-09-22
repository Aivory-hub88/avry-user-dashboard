/**
 * SpaceDiscussion — mode Discussion di Space view (redesain UI/UX total).
 *
 * API 100% tetap (stream / thread / messages / topics / agent-tasks / activity).
 * Yang berubah hanya presentasi + UX, ala Slack/Linear:
 *
 * - Stream header: judul + count, presence stack, filter search, refresh,
 *   tombol "New thread" (fokus ke composer).
 * - Root cards: aksen violet saat thread aktif, hover actions (reply, copy
 *   link, delete), topic pill klik-able, reply summary, group per hari.
 * - Composer elevated: toolbar @/#, focus ring, tombol Send ikon.
 * - Optimistic send ala Nakama-ack: pesan langsung tampil sebagai "You"
 *   (Sending… → Sent ✓ → hilang saat refresh memuat aslinya); gagal →
 *   Retry inline. Box tidak menunggu round-trip.
 * - Thread panel: header (judul topic + count + close), blok topic, timeline
 *   root → replies, reply composer sticky di bawah.
 * - States rapi: skeleton loading, error + Retry, empty state dengan CTA.
 *
 * Kontrak yang dijaga (jangan diubah tanpa update test):
 * - placeholder root "Write an update…", reply "Reply… @ for agents",
 *   topic "Thread goal title…"; menu mention role="listbox"; delete flow
 *   title="Delete this thread and its replies" + "Sure?"; string
 *   "Loading thread…"; panel scroll pakai class overflow-y-auto; search
 *   pakai type="search" (bukan textbox) supaya indeks textbox di test stabil.
 *
 * Aturan gaya (SCOPE §5.3–5.4): token existing saja, teks hanya span/div.
 */
"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { createPortal } from "react-dom"
import {
  ChevronLeft,
  Copy,
  MessageSquarePlus,
  PanelRight,
  Plus,
  RefreshCw,
  Reply,
  Search,
  Trash2,
  X,
} from "lucide-react"
import { collabAuthHeaders, collabToken } from "@/lib/collabClient"
import { AuthManager } from "@/lib/authManager"
import { useWorkspaceAwareness } from "@/hooks/useWorkspaceAwareness"
import { useDiscussionResource } from "@/hooks/useDiscussionResource"
import { useAgentMention } from "@/hooks/useAgentMention"
import { AgentAvatar } from "@/components/office/AgentAvatar"
import { candidateOf, type MentionCandidate } from "@/lib/agentMentions"
import { AGENT_ROSTER } from "@/lib/agentRoster"
import { agentDisplayName, type SpaceAgentTask } from "@/lib/spaceAgent"
import { ThinkingDots } from "@/components/ui/ThinkingDots"
import { timeAgo, MENU_POPOVER_CLASS, PRESENCE_RING_CLASS, placeMenu } from "@/lib/spaceUi"
import SpaceAgentPanel from "@/components/workspace/SpaceAgentPanel"
import SpaceActivityPanel from "@/components/workspace/SpaceActivityPanel"
import type { SpaceMessage, SpaceTopic } from "@/lib/spaceProtocol"

type RootItem = SpaceMessage & {
  replyCount: number
  topic: SpaceTopic | null
  /** 2 balasan terakhir (ascending) — bahan chat inline. Absen di mock lama. */
  recentReplies: SpaceMessage[]
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

/**
 * Pesan optimistic (provisional) ala Nakama-ack: langsung tampil sebagai
 * "You" selagi POST berjalan; status sending → sent (ack id diterima) →
 * hilang begitu refresh memuat pesan aslinya; failed → Retry inline.
 */
type PendingStatus = "sending" | "sent" | "failed"
interface PendingMsg {
  tempId: string
  threadRoot: string | null
  body: string
  status: PendingStatus
  /** Id server dari ack 201 — untuk drop saat refresh sudah memuatnya. */
  realId: string | null
  at: number
}

function newTempId(): string {
  try {
    return `pending-${crypto.randomUUID()}`
  } catch {
    return `pending-${Date.now()}-${Math.floor(Math.random() * 1e9)}`
  }
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

/** user_id sendiri (untuk bubble kanan ala console). Null bila tak dikenal. */
function claimSelfId(obj: unknown): string | null {
  if (!obj || typeof obj !== "object") return null
  const o = obj as Record<string, unknown>
  for (const k of ["user_id", "sub", "id"]) {
    if (typeof o[k] === "string" && o[k]) return o[k] as string
  }
  return null
}

function useSelfId(): string | null {
  const [selfId] = useState<string | null>(() => {
    try {
      if (typeof window === "undefined") return null
      const direct = AuthManager.getUserId?.()
      if (typeof direct === "string" && direct) return direct
      const u = AuthManager.getUser?.() as { user_id?: unknown; email?: unknown } | null
      if (u && typeof u.user_id === "string" && u.user_id) return u.user_id
      // Fallback: intip klaim JWT (tanpa verifikasi — hanya untuk tampilan).
      const token = collabToken()
      if (token) {
        const part = token.split(".")[1]
        if (part) {
          const b64 = part.replace(/-/g, "+").replace(/_/g, "/")
          const bin = atob(b64)
          const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
          const id = claimSelfId(JSON.parse(new TextDecoder().decode(bytes)))
          if (id) return id
        }
      }
      if (u && typeof u.email === "string" && u.email) return u.email
    } catch {
      // abaikan — pesan tampil sebagai kiri
    }
    return null
  })
  return selfId
}

function isOwnMessage(m: SpaceMessage, selfId: string | null): boolean {
  return selfId !== null && m.author.actingMode === "user" && m.author.memberId === selfId
}

function excerptOf(body: string, max = 140): string {
  const t = body.trim().replace(/\s+/g, " ")
  return t.length > max ? `${t.slice(0, max)}…` : t
}

/** Panah kirim console (disalin dari ChatInput.SendArrowIcon supaya tidak
 *  menarik dependensi berat UploadMenu/ContextToolbar ke chunk discussion). */
function SendArrowIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 14 4 9 9 4" />
      <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
    </svg>
  )
}

/** Label hari untuk group stream: Today / Yesterday / tanggal. */
function dayLabel(iso: string): string {
  const t = new Date(iso)
  if (!Number.isFinite(t.getTime())) return ""
  const now = new Date()
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diffDays = Math.round((startOf(now) - startOf(t)) / 86400000)
  if (diffDays <= 0) return "Today"
  if (diffDays === 1) return "Yesterday"
  return t.toLocaleDateString(undefined, { day: "numeric", month: "short", year: t.getFullYear() === now.getFullYear() ? undefined : "numeric" })
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
        className={
          isAgent
            ? "font-medium text-accent"
            : "inline-block rounded-full border border-white/10 bg-white/[0.08] px-2 py-px text-[12px] text-white/75"
        }
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
    const isAgentToken = target.startsWith("agent:")
    parts.push({
      key: k++,
      node: isAgentToken ? (
        <span className="font-medium text-accent">{label}</span>
      ) : (
        <span className="inline-block rounded-full border border-white/10 bg-white/[0.08] px-2 py-px text-[12px] text-white/75">
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

/**
 * Avatar chat — meniru AI console persis:
 * - agent → portrait AgentAvatar (ilustrasi per tipe, tanpa huruf/ring ungu)
 * - manusia → lingkaran netral inisial (tanpa aksen warna)
 */
function LetterAvatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-white/[0.08] font-semibold text-white/70"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials(name)}
    </span>
  )
}

function ChatAvatar({ m, size = 32 }: { m: SpaceMessage; size?: number }) {
  if (m.author.actingMode === "agent") {
    return <AgentAvatar type={m.author.agentType ?? null} size={size} />
  }
  return <LetterAvatar name={displayName(m)} size={size} />
}

function AgentPill() {
  return (
    <span className="rounded-full border border-white/15 bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/50">
      agent
    </span>
  )
}

function MessageHead({ m, topicTitle }: { m: SpaceMessage; topicTitle?: string | null }) {
  const name = displayName(m)
  const isAgent = m.author.actingMode === "agent"
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="truncate text-[13px] font-medium text-white/85">{name}</span>
        {isAgent && <AgentPill />}
        <span className="shrink-0 text-[11px] tabular-nums text-white/35" title={m.createdAt}>
          {timeAgo(m.createdAt)}
        </span>
        {m.editedAt && (
          <span className="shrink-0 text-[11px] text-white/25">(edited)</span>
        )}
      </div>
      {topicTitle && (
        <div className="mt-1">
          <span className="inline-block max-w-full truncate rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-white/60">
            {topicTitle}
          </span>
        </div>
      )}
    </div>
  )
}

function MessageBody({ m }: { m: SpaceMessage }) {
  return (
    <div className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-[1.6] text-white/75">
      {m.body ? <RichBody body={m.body} /> : <span className="italic text-white/30">(deleted)</span>}
    </div>
  )
}

/** Aksi hover ala MessageActions console: ikon w-7 rounded-md. */
function RowActions({
  onReply,
  onCopy,
  deleteNode,
}: {
  onReply?: () => void
  onCopy?: () => void
  deleteNode?: React.ReactNode
}) {
  const btn =
    "w-7 h-7 flex items-center justify-center rounded-md text-white/40 hover:text-white/80 hover:bg-white/[0.08] transition-colors duration-150"
  return (
    <div className="flex items-center gap-0.5 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100">
      {onReply && (
        <button onClick={onReply} title="Reply" aria-label="Reply" className={btn}>
          <Reply className="w-3.5 h-3.5" />
        </button>
      )}
      {onCopy && (
        <button onClick={onCopy} title="Copy" aria-label="Copy" className={btn}>
          <Copy className="w-3.5 h-3.5" />
        </button>
      )}
      {deleteNode}
    </div>
  )
}

/**
 * Baris chat — meniru ChatMessage console persis:
 * - milik sendiri → bubble kanan bg #282825, tanpa avatar/nama
 * - agent → portrait AgentAvatar 36 + bubble bg-white/[0.035], tanpa nama/pill
 * - member lain → avatar huruf netral + nama + bubble yang sama
 * Tanpa aksen ungu di mana pun.
 */
function ChatRow({
  m,
  own,
  topicTitle,
  highlighted,
  onReply,
  deleteNode,
  extraBelow,
}: {
  m: SpaceMessage
  own: boolean
  topicTitle?: string | null
  highlighted?: boolean
  onReply?: () => void
  deleteNode?: React.ReactNode
  extraBelow?: React.ReactNode
}) {
  const isAgent = m.author.actingMode === "agent"
  const body = m.body ? (
    <RichBody body={m.body} />
  ) : (
    <span className="italic text-white/30">(deleted)</span>
  )
  const copy = () => {
    try {
      void navigator.clipboard?.writeText(m.body)
    } catch {
      // abaikan
    }
  }
  if (own) {
    return (
      <div className={`group relative rounded-xl ${highlighted ? "bg-white/[0.02]" : ""}`}>
        {topicTitle && (
          <div className="mb-1 text-right text-[11px] text-white/35">{topicTitle}</div>
        )}
        <div className="flex justify-end">
          <div
            className="max-w-[80%] bg-[#282825] rounded-[20px] px-5 py-3.5 text-base text-white leading-[1.6] border border-line text-left"
            title={m.createdAt}
          >
            {body}
          </div>
        </div>
        <div className="mt-1 flex justify-end">
          <RowActions onReply={onReply} onCopy={copy} deleteNode={deleteNode} />
        </div>
        {extraBelow}
      </div>
    )
  }
  return (
    <div className={`group relative rounded-xl ${highlighted ? "bg-white/[0.02]" : ""}`}>
      <div className="flex items-start gap-4">
        {isAgent ? (
          <AgentAvatar type={m.author.agentType ?? null} size={36} className="mt-0.5" />
        ) : (
          <span className="mt-0.5 flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[13px] font-semibold text-white/70">
            {initials(displayName(m))}
          </span>
        )}
        <div className="flex-1 min-w-0 max-w-[720px] text-left">
          {topicTitle && <div className="mb-1 text-[11px] text-white/35">{topicTitle}</div>}
          {!isAgent && (
            <div className="mb-1 flex flex-wrap items-baseline gap-x-2">
              <span className="truncate text-[13px] font-medium text-white/85">
                {displayName(m)}
              </span>
              <span className="shrink-0 text-[11px] tabular-nums text-white/25" title={m.createdAt}>
                {timeAgo(m.createdAt)}
              </span>
            </div>
          )}
          <div
            className="rounded-2xl border border-line bg-white/[0.035] px-5 py-3.5 text-base text-[#f7f7f7] leading-[1.6]"
            title={isAgent ? m.createdAt : undefined}
          >
            {body}
          </div>
          <div className="mt-1">
            <RowActions onReply={onReply} onCopy={copy} deleteNode={deleteNode} />
          </div>
        </div>
      </div>
      {extraBelow}
    </div>
  )
}

/** Provisional optimistic: bubble kanan milik sendiri + status kirim. */
function PendingRow({ p, onRetry }: { p: PendingMsg; onRetry: (tempId: string) => void }) {
  return (
    <div className="group relative">
      <div className="flex justify-end">
        <div className="max-w-[80%]">
          <div className="bg-[#282825] rounded-[20px] px-5 py-3.5 text-base text-white leading-[1.6] border border-line text-left opacity-70">
            <RichBody body={p.body} />
          </div>
          <div className="mt-1 text-right text-[11px] text-white/30">
            {p.status === "failed" ? (
              <span className="inline-flex items-center gap-2">
                <span>Couldn&apos;t send</span>
                <button
                  onClick={() => onRetry(p.tempId)}
                  className="rounded-full bg-white/[0.08] px-3 py-1 text-white/75 hover:bg-white/[0.12]"
                >
                  Retry
                </button>
              </span>
            ) : p.status === "sent" ? (
              <span>Sent ✓</span>
            ) : (
              <span>Sending…</span>
            )}
          </div>
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
  docs,
  onDispatch,
  draft,
  updateDraft,
  textareaId,
  autofocus,
  replyQuote,
  onCancelReply,
}: {
  draft: Draft
  updateDraft: (update: Partial<Draft>) => void
  placeholder: string
  disabled: boolean
  docs: DocOption[]
  /** Optimistic dispatch: parent menampilkan provisional + POST + ack. */
  onDispatch: (body: string) => void
  textareaId?: string
  autofocus?: boolean
  /** Quote WhatsApp-style di atas composer (reply inline, pola ChatInput). */
  replyQuote?: { name: string; excerpt: string } | null
  onCancelReply?: () => void
}) {
  const { text, error: sendError } = draft
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

  /** Toolbar @/#: sisipkan trigger di cursor lalu buka menu-nya. */
  const insertTrigger = useCallback(
    (ch: "@" | "#") => {
      if (disabled) return
      const el = boxRef.current
      const cursor = el?.selectionStart ?? text.length
      const atLineStart = cursor === 0 || text[cursor - 1] === "\n" || text[cursor - 1] === " "
      const insert = atLineStart ? ch : ` ${ch}`
      const next = `${text.slice(0, cursor)}${insert}${text.slice(cursor)}`
      const caret = cursor + insert.length
      setText(next)
      mention.checkForMention(next, caret)
      updateHash(next, caret)
      requestAnimationFrame(() => {
        el?.focus()
        try {
          el?.setSelectionRange(caret, caret)
        } catch {
          // abaikan
        }
      })
    },
    [disabled, text, setText, mention, updateHash],
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

  /**
   * Optimistic send ala Nakama-ack: pesan langsung dibersihkan dari box dan
   * diteruskan ke parent (provisional "You" + POST + ack + refresh). Tidak
   * menunggu round-trip — box langsung siap untuk pesan berikutnya.
   */
  const send = useCallback(() => {
    const body = text.trim()
    if (!body || disabled) return
    updateDraft({ text: "", error: null })
    mention.closeMenu()
    setHashNeedle(null)
    try {
      onDispatch(body)
    } catch {
      updateDraft({ text: body, error: "Could not send message. Try again." })
    }
  }, [text, disabled, mention, updateDraft, onDispatch])

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
      send()
    }
  }

  const showHereRow = hereRow && !disabled

  return (
    <div>
      {/* Portal ke body: position:fixed menu harus relatif ke viewport.
          Di dalam wrapper sticky + backdrop-blur, fixed malah relatif ke
          wrapper itu (containing block) — menu melayang lepas (bug 2026-09-22). */}
      {menuVisible && pickPos && !disabled && typeof document !== "undefined" && createPortal(
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
        </div>,
        document.body,
      )}
      {/* Composer = kartu console persis: bg #1f1f22, radius 20,
          textarea console-textarea, tombol console-icon-btn/send-btn. */}
      <div className="bg-[#1f1f22] border border-line rounded-[20px] overflow-hidden">
        {replyQuote && (
          <div className="flex items-start gap-2 px-4 pt-3 pb-2 border-b border-line/60">
            <div className="flex-1 min-w-0 pl-2.5 border-l-2 border-accent/50">
              <div className="text-[12px] font-medium text-accent/80">
                Replying to {replyQuote.name}
              </div>
              <div className="text-[13px] text-[#a1a1aa] truncate">{replyQuote.excerpt}</div>
            </div>
            <button
              type="button"
              onClick={onCancelReply}
              aria-label="Cancel reply"
              className="shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-white/40 hover:text-white/80 hover:bg-white/[0.08] transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <textarea
          id={textareaId}
          ref={boxRef}
          value={text}
          disabled={disabled}
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
          autoFocus={autofocus}
          className="console-textarea w-full px-5 pt-[14px] pb-1 text-[15px]"
        />
        <div className="flex items-center justify-between px-4 pt-1 pb-3">
          <div className="flex items-center gap-[6px]">
            <button
              type="button"
              title="Mention someone or an agent (@)"
              aria-label="Mention someone or an agent"
              disabled={disabled}
              onClick={() => insertTrigger("@")}
              className="console-icon-btn"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <button
            onClick={() => send()}
            disabled={disabled || !text.trim()}
            title="Send message (Enter)"
            aria-label="Send message"
            className="console-send-btn"
          >
            <SendArrowIcon size={16} />
          </button>
        </div>
      </div>
      {sendError && <div role="alert" className="mt-1 px-1 text-[12px] text-red-300">{sendError}</div>}
    </div>
  )
}

/** Skeleton loading untuk stream — 3 kartu berdenyut. */
function StreamSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="animate-pulse rounded-2xl bg-white/[0.02] p-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-white/[0.07]" />
            <div className="flex-1">
              <div className="h-3 w-1/3 rounded-full bg-white/[0.07]" />
              <div className="mt-2 h-3 w-5/6 rounded-full bg-white/[0.05]" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/** Tombol hapus thread dengan konfirmasi inline (Sure? → hapus). */
function DeleteThreadButton({
  active,
  deleting,
  onAsk,
  onCancel,
  onConfirm,
}: {
  active: boolean
  deleting: boolean
  onAsk: () => void
  onCancel: () => void
  onConfirm: () => void
}) {
  if (!active) {
    return (
      <button
        onClick={onAsk}
        title="Delete this thread and its replies"
        aria-label="Delete this thread and its replies"
        className="w-7 h-7 flex items-center justify-center rounded-md text-white/40 hover:text-red-300 hover:bg-white/[0.08] transition-colors duration-150 opacity-0 focus:opacity-100 group-hover:opacity-100"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    )
  }
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-red-500/10 px-2 py-1">
      <button
        onClick={onConfirm}
        disabled={deleting}
        title="Delete this thread and its replies"
        className="text-[11px] font-medium text-red-300 hover:text-red-200 disabled:opacity-40"
      >
        {deleting ? "…" : "Sure?"}
      </button>
      <button onClick={onCancel} aria-label="Cancel delete" className="rounded-full p-0.5 text-white/40 hover:text-white/70">
        <X className="h-3 w-3" />
      </button>
    </span>
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
  // Panel kanan hideable ala AI console (persist). Default: sembunyi bila
  // tidak ada thread yang diminta — stream yang jadi bintang utama.
  const [panelHidden, setPanelHidden] = useState<boolean>(() => {
    try {
      if (typeof window === "undefined") return !initialThread
      const stored = window.localStorage.getItem("aivory_discussion_panel")
      if (stored !== null) return stored === "1"
    } catch {
      // abaikan — pakai default
    }
    return !initialThread
  })
  const setPanelHiddenPersist = useCallback((hidden: boolean) => {
    setPanelHidden(hidden)
    try {
      window.localStorage.setItem("aivory_discussion_panel", hidden ? "1" : "0")
    } catch {
      // abaikan — tetap jalan tanpa persist
    }
  }, [])
  const panelVisible = !panelHidden && (openRoot !== null || panelTab === "activity")
  const [query, setQuery] = useState("")
  const selfId = useSelfId()
  if (lastInitialThread !== initialThread) {
    setLastInitialThread(initialThread)
    setOpenRoot(initialThread)
    setPanelTab("thread")
    if (initialThread) setPanelHidden(false)
  }
  const stream = useDiscussionResource<{ roots: RootItem[] }>(`/api/workspace/${spaceId}/stream?limit=50`)
  const threadResource = useDiscussionResource<ThreadPayload>(openRoot
    ? `/api/workspace/${spaceId}/thread?root=${encodeURIComponent(openRoot)}` : null)
  // Satu poll untuk seluruh Space: status task terbuka per thread, bahan
  // gelembung thinking di tengah (pola console, bukan di panel saja).
  const spaceTasks = useDiscussionResource<{ tasks: SpaceAgentTask[] }>(
    `/api/workspace/${spaceId}/agent-tasks`,
  )
  const thinkingByRoot = useMemo(() => {
    const map = new Map<string, string[]>()
    const list = Array.isArray(spaceTasks.data?.tasks) ? spaceTasks.data.tasks : []
    for (const t of list) {
      if (t.status !== "todo" && t.status !== "in_progress" && t.status !== "blocked") continue
      if (!t.threadRoot) continue
      const names = map.get(t.threadRoot) ?? []
      const label = agentDisplayName(t.agentType)
      if (!names.includes(label)) names.push(label)
      map.set(t.threadRoot, names)
    }
    return map
  }, [spaceTasks.data])
  const firstThinkingType = useMemo(() => {
    const map = new Map<string, string>()
    const list = Array.isArray(spaceTasks.data?.tasks) ? spaceTasks.data.tasks : []
    for (const t of list) {
      if (t.status !== "todo" && t.status !== "in_progress" && t.status !== "blocked") continue
      if (!t.threadRoot || map.has(t.threadRoot)) continue
      map.set(t.threadRoot, t.agentType)
    }
    return map
  }, [spaceTasks.data])
  const roots = useMemo(
    () => (Array.isArray(stream.data?.roots) ? stream.data.roots : []),
    [stream.data],
  )
  const loading = stream.loading
  const loadError = stream.error ? "Could not load discussion." : null
  const thread = threadResource.data?.root.id === openRoot ? threadResource.data : null
  const threadLoading = threadResource.loading
  const loadStream = stream.refresh
  const loadThread = threadResource.refresh
  const loadSpaceTasks = spaceTasks.refresh
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
  // Reply inline di tengah (ala AI console): quote WhatsApp-style masuk ke
  // composer; draft terisolasi per thread.
  const [replyTo, setReplyTo] = useState<{ rootId: string; name: string; excerpt: string } | null>(null)
  const updateInlineDraft = useCallback(
    (rootId: string) => (update: Partial<Draft>) => {
      const key = `inline:${rootId}`
      setDrafts((prev) => ({ ...prev, [key]: { ...(prev[key] ?? EMPTY_DRAFT), ...update } }))
    },
    [],
  )
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
      setPanelHiddenPersist(false)
      router.replace(`/workspace/${spaceId}?view=discussion&thread=${encodeURIComponent(rootId)}`, { scroll: false })
    },
    [router, spaceId, setPanelHiddenPersist],
  )

  const closeThread = useCallback(() => {
    setOpenRoot(null)
    setPanelHiddenPersist(true)
    router.replace(`/workspace/${spaceId}?view=discussion`, { scroll: false })
  }, [router, spaceId, setPanelHiddenPersist])

  const [confirmDeleteRoot, setConfirmDeleteRoot] = useState<string | null>(null)
  const [deletingRoot, setDeletingRoot] = useState<string | null>(null)

  const refreshAll = useCallback(() => {
    void loadStream()
    void loadThread()
    void loadSpaceTasks()
  }, [loadStream, loadThread, loadSpaceTasks])

  const focusRootComposer = useCallback(() => {
    requestAnimationFrame(() => {
      document.getElementById("discussion-root-composer")?.focus()
    })
  }, [])

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

  // ── Optimistic send (ack ala Nakama) ─────────────────────────────
  const [pending, setPending] = useState<PendingMsg[]>([])

  const postMessage = useCallback(
    async (threadRoot: string | null, body: string) => {
      const r = await fetch(`/api/workspace/${spaceId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...collabAuthHeaders() },
        body: JSON.stringify({ threadRoot, body }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok || typeof j?.message?.id !== "string") throw new Error("send failed")
      return j.message as SpaceMessage
    },
    [spaceId],
  )

  const dispatchSend = useCallback(
    (threadRoot: string | null, body: string) => {
      const clean = body.trim()
      if (!clean || !canWrite) return
      const tempId = newTempId()
      setPending((prev) => [...prev, { tempId, threadRoot, body: clean, status: "sending", realId: null, at: Date.now() }])
      void postMessage(threadRoot, clean)
        .then((message) => {
          setPending((prev) =>
            prev.map((p) => (p.tempId === tempId ? { ...p, status: "sent", realId: message.id } : p)),
          )
          refreshAll()
        })
        .catch(() => {
          setPending((prev) =>
            prev.map((p) => (p.tempId === tempId ? { ...p, status: "failed" } : p)),
          )
        })
    },
    [canWrite, postMessage, refreshAll],
  )

  const retrySend = useCallback(
    (tempId: string) => {
      const target = pending.find((p) => p.tempId === tempId)
      if (!target || target.status !== "failed" || !canWrite) return
      setPending((prev) =>
        prev.map((p) => (p.tempId === tempId ? { ...p, status: "sending", at: Date.now() } : p)),
      )
      void postMessage(target.threadRoot, target.body)
        .then((message) => {
          setPending((prev) =>
            prev.map((p) => (p.tempId === tempId ? { ...p, status: "sent", realId: message.id } : p)),
          )
          refreshAll()
        })
        .catch(() => {
          setPending((prev) =>
            prev.map((p) => (p.tempId === tempId ? { ...p, status: "failed" } : p)),
          )
        })
    },
    [pending, canWrite, postMessage, refreshAll],
  )

  // Drop provisional begitu pesan aslinya sudah dimuat refresh (cocok via
  // ack realId) + pengaman umur. Bail-out bila tak ada perubahan (anti-loop).
  useEffect(() => {
    const serverIds = new Set<string>()
    for (const r of roots) serverIds.add(r.id)
    if (thread) {
      serverIds.add(thread.root.id)
      for (const m of thread.replies) serverIds.add(m.id)
    }
    const now = Date.now()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPending((prev) => {
      const next = prev.filter((p) => {
        if (p.status === "sent" && p.realId && serverIds.has(p.realId)) return false
        if (p.status === "sent" && now - p.at > 30000) return false
        if (p.status !== "failed" && now - p.at > 120000) return false
        return true
      })
      return next.length === prev.length ? prev : next
    })
  }, [roots, thread])

  const needle = query.trim().toLowerCase()
  const filtered = useMemo(() => {
    if (!needle) return roots
    return roots.filter((r) => {
      const name = displayName(r).toLowerCase()
      const topic = r.topic?.title.toLowerCase() ?? ""
      return r.body.toLowerCase().includes(needle) || name.includes(needle) || topic.includes(needle)
    })
  }, [roots, needle])

  // Chat ala AI console: kronologis menanjak (terlama di atas, terbaru di
  // bawah), stream punya scroll sendiri + nempel ke bawah selama user tidak
  // sedang membaca riwayat atas.
  const ascRoots = useMemo(() => [...filtered].reverse(), [filtered])

  const listRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)
  const onListScroll = useCallback(() => {
    const el = listRef.current
    if (!el) return
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140
  }, [])
  const scrollKey = useMemo(() => {
    const ids = roots.map((r) => `${r.id}:${r.replyCount}`).join(",")
    const reps = roots
      .map((r) => (r.recentReplies ?? []).map((m) => m.id).join("+"))
      .join(",")
    return `${ids}|${reps}|${pending.length}`
  }, [roots, pending.length])
  useEffect(() => {
    const el = listRef.current
    if (el && stickRef.current) el.scrollTop = el.scrollHeight
  }, [scrollKey])

  const groups = useMemo(() => {
    const out: { label: string; items: RootItem[] }[] = []
    for (const r of ascRoots) {
      const label = dayLabel(r.createdAt)
      const last = out[out.length - 1]
      if (last && last.label === label) last.items.push(r)
      else out.push({ label, items: [r] })
    }
    return out
  }, [ascRoots])

  const pendingRoots = useMemo(() => pending.filter((p) => p.threadRoot === null), [pending])
  const pendingReplies = useMemo(
    () => (openRoot ? pending.filter((p) => p.threadRoot === openRoot) : []),
    [pending, openRoot],
  )

  const threadTitle = thread?.topic && !thread.topic.archived ? thread.topic.title : "Thread"
  const threadReplyCount = thread ? thread.replies.length : 0

  return (
    <div className="mx-auto flex h-full w-full max-w-[1240px] items-stretch gap-4">
      {/* ── STREAM = chat room ─────────────────────────────────── */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Header — flat ala console, tanpa kartu. */}
        <div className="shrink-0 px-1 py-2">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-medium text-white/85">Discussion</span>
                {!loading && (
                  <span className="rounded-full bg-white/[0.07] px-2 py-0.5 text-[11px] tabular-nums text-white/55">
                    {roots.length}
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-[12px] text-white/35">
                <span>
                  {needle
                    ? `${filtered.length} of ${roots.length} shown`
                    : "Team chat — humans & agents in one flow"}
                </span>
              </div>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {peers.length > 0 && (
                <span className="flex items-center" title={`${peers.length} online`}>
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
              <button
                onClick={refreshAll}
                title="Refresh discussion"
                className="rounded-full p-2 text-white/40 hover:bg-white/[0.06] hover:text-white/80"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setPanelHiddenPersist(!panelHidden)}
                title={panelVisible ? "Hide thread panel" : "Show thread panel"}
                aria-label={panelVisible ? "Hide thread panel" : "Show thread panel"}
                aria-expanded={panelVisible}
                className={`rounded-full p-2 hover:bg-white/[0.06] hover:text-white/80 ${panelVisible ? "text-white/80" : "text-white/40"}`}
              >
                <PanelRight className="h-3.5 w-3.5" />
              </button>
              {canWrite && (
                <button
                  onClick={focusRootComposer}
                  className="flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-[12px] font-medium text-black hover:bg-white/90"
                >
                  <MessageSquarePlus className="h-3.5 w-3.5" />
                  <span>New message</span>
                </button>
              )}
            </div>
          </div>
          <div className="mt-3">
            <label className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-1.5 focus-within:bg-white/[0.06]">
              <Search className="h-3.5 w-3.5 shrink-0 text-white/25" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter discussion…"
                aria-label="Filter discussion"
                className="min-w-0 flex-1 bg-transparent text-[12px] text-white/75 outline-none placeholder:text-white/25"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  aria-label="Clear filter"
                  className="rounded-full p-0.5 text-white/40 hover:text-white/75"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </label>
          </div>
        </div>

        {/* Chat flow: scroll sendiri, nempel ke bawah selama user di dasar. */}
        <div ref={listRef} onScroll={onListScroll} className="min-h-0 flex-1 overflow-y-auto px-1">
          {/* Body */}
          {loading && <StreamSkeleton />}
        {loadError && (
          <div className="rounded-2xl bg-white/[0.03] p-8 text-center">
            <div className="text-[14px] font-medium text-white/70">{loadError}</div>
            <div className="mt-1 text-[12px] text-white/35">Check your connection and try again.</div>
            <button
              onClick={refreshAll}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-[12px] font-medium text-black hover:bg-white/90"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Retry</span>
            </button>
          </div>
        )}
        {!loading && !loadError && roots.length === 0 && (
          <div className="rounded-2xl bg-white/[0.02] p-10 text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-white/[0.05] text-white/50">
              <MessageSquarePlus className="h-5 w-5" />
            </div>
            <div className="mt-3 text-[14px] font-medium text-white/70">Start the discussion</div>
            <div className="mx-auto mt-1 max-w-[380px] text-[12px] leading-relaxed text-white/35">
              <span>Post the first update below. Mention an agent with @ to put them to work, or link a doc with #.</span>
            </div>
            {canWrite && (
              <button
                onClick={focusRootComposer}
                className="mt-4 rounded-full bg-white px-4 py-1.5 text-[12px] font-medium text-black hover:bg-white/90"
              >
                Write the first message
              </button>
            )}
          </div>
        )}
        {!loading && !loadError && roots.length > 0 && filtered.length === 0 && (
          <div className="rounded-2xl bg-white/[0.03] p-8 text-center">
            <div className="text-[14px] font-medium text-white/70">No matches</div>
            <div className="mt-1 text-[12px] text-white/35">Nothing matches “{query.trim()}”.</div>
            <button
              onClick={() => setQuery("")}
              className="mt-4 rounded-full bg-white/[0.08] px-4 py-1.5 text-[12px] text-white/75 hover:bg-white/[0.12]"
            >
              Clear filter
            </button>
          </div>
        )}

        <div className="flex flex-col gap-4">
          {groups.map((g) => (
            <div key={g.label}>
              <div className="mb-2 flex items-center gap-3 px-1">
                <span className="shrink-0 text-[11px] font-medium uppercase tracking-[0.12em] text-white/30">
                  {g.label}
                </span>
                <span className="h-px flex-1 bg-white/[0.06]" />
              </div>
              <div className="flex flex-col">
                {g.items.map((r) => {
                  const ownRoot = isOwnMessage(r, selfId)
                  const shown = r.recentReplies ?? []
                  const inlineKey = `inline:${r.id}`
                  const topic = r.topic && !r.topic.archived ? r.topic.title : null
                  const hiddenCount = r.replyCount - shown.length
                  return (
                    <div key={r.id} className="mb-7 last:mb-2">
                      <ChatRow
                        m={r}
                        own={ownRoot}
                        topicTitle={topic}
                        highlighted={openRoot === r.id}
                        onReply={
                          canWrite
                            ? () =>
                                setReplyTo({
                                  rootId: r.id,
                                  name: ownRoot ? "yourself" : displayName(r),
                                  excerpt: excerptOf(r.body),
                                })
                            : undefined
                        }
                        deleteNode={
                          canWrite ? (
                            <DeleteThreadButton
                              active={confirmDeleteRoot === r.id}
                              deleting={deletingRoot === r.id}
                              onAsk={() => setConfirmDeleteRoot(r.id)}
                              onCancel={() => setConfirmDeleteRoot(null)}
                              onConfirm={() => void deleteRoot(r.id)}
                            />
                          ) : undefined
                        }
                      />
                      {shown.map((rep) => {
                        const ownRep = isOwnMessage(rep, selfId)
                        return (
                          <div key={rep.id} className="mt-5">
                            <ChatRow
                              m={rep}
                              own={ownRep}
                              onReply={
                                canWrite
                                  ? () =>
                                      setReplyTo({
                                        rootId: r.id,
                                        name: ownRep ? "yourself" : displayName(rep),
                                        excerpt: excerptOf(rep.body),
                                      })
                                  : undefined
                              }
                            />
                          </div>
                        )
                      })}
                      {/* Agent sedang kerja di thread ini — gelembung thinking
                          console di tengah flow (bukan cuma di panel). */}
                      {thinkingByRoot.get(r.id) && (
                        <div className="mt-5">
                          <div className="flex items-start gap-4">
                            <AgentAvatar
                              type={firstThinkingType.get(r.id) ?? null}
                              size={36}
                              className="mt-0.5"
                            />
                            <div className="flex items-center gap-2.5 rounded-2xl border border-line bg-white/[0.035] px-5 py-3.5">
                              <ThinkingDots size={16} dotSize={2.5} />
                              <span className="text-sm text-[#a1a1aa]">
                                {(thinkingByRoot.get(r.id) ?? []).join(", ")} is thinking…
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                      {hiddenCount > 0 ? (
                        <div className={ownRoot ? "mt-2 text-right" : "ml-[52px] mt-2"}>
                          <button
                            onClick={() => openThread(r.id)}
                            className="text-[12px] text-accent/80 hover:text-accent"
                          >
                            View all {r.replyCount} {r.replyCount === 1 ? "reply" : "replies"} →
                          </button>
                        </div>
                      ) : (
                        (r.replyCount > 0 || topic) && (
                          <div className={ownRoot ? "mt-1 text-right" : "ml-[52px] mt-1"}>
                            <button
                              onClick={() => openThread(r.id)}
                              className="text-[12px] text-white/30 hover:text-white/70"
                            >
                              Thread →
                            </button>
                          </div>
                        )
                      )}
                      {/* Reply inline di tengah — quote masuk ke composer. */}
                      {replyTo?.rootId === r.id && (
                        <div className="mt-3">
                          <Composer
                            draft={drafts[inlineKey] ?? EMPTY_DRAFT}
                            updateDraft={updateInlineDraft(r.id)}
                            placeholder="Reply to thread…"
                            disabled={!canWrite}
                            docs={docs}
                            onDispatch={(body) => dispatchSend(r.id, body)}
                            autofocus
                            replyQuote={{ name: replyTo.name, excerpt: replyTo.excerpt }}
                            onCancelReply={() => setReplyTo(null)}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Provisional roots (optimistic) — selalu di bawah, milik sendiri. */}
        {pendingRoots.length > 0 && (
          <div className="flex flex-col pb-2">
            {pendingRoots.map((p) => (
              <div key={p.tempId} className="rounded-xl px-2 py-2.5">
                <PendingRow p={p} onRetry={retrySend} />
              </div>
            ))}
          </div>
        )}
        </div>

        <div className="mt-2 shrink-0 px-1 pb-1">
          <Composer
            draft={drafts.null ?? EMPTY_DRAFT}
            updateDraft={updateRoot}
            placeholder="Write an update… @ for agents, # for docs"
            disabled={!canWrite}
            docs={docs}
            onDispatch={(body) => dispatchSend(null, body)}
            textareaId="discussion-root-composer"
          />
        </div>
      </div>

      {/* ── SIDE PANEL = thread detail (hideable) ──────────────── */}
      <div
        className={`${panelVisible ? "flex" : "hidden"} max-h-[calc(100dvh-180px)] min-h-0 w-full shrink-0 flex-col overflow-y-auto py-1 pl-1 pr-2 lg:h-full lg:max-h-full lg:w-[400px] lg:max-w-[400px]`}
      >
        <div className="mb-3 flex items-center gap-1 rounded-full bg-white/[0.04] p-1">
          <button
            onClick={() => setPanelTab("thread")}
            className={`flex-1 rounded-full px-3 py-1 text-[12px] ${panelTab === "thread" ? "bg-white font-medium text-black" : "text-white/40 hover:text-white/70"}`}
          >
            Thread
          </button>
          <button
            onClick={() => setPanelTab("activity")}
            className={`flex-1 rounded-full px-3 py-1 text-[12px] ${panelTab === "activity" ? "bg-white font-medium text-black" : "text-white/40 hover:text-white/70"}`}
          >
            Activity
          </button>
        </div>
        {panelTab === "activity" ? (
          <SpaceActivityPanel onOpenThread={openThread} />
        ) : !openRoot ? (
          <div className="rounded-xl bg-white/[0.02] p-6 text-center">
            <div className="text-[13px] font-medium text-white/60">No thread selected</div>
            <div className="mt-1 text-[12px] text-white/35">
              <span>Select a thread from the stream to read replies, run agents, and manage its goal here.</span>
            </div>
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div className="mb-3 flex items-start gap-2">
              <button
                onClick={closeThread}
                title="Back to stream"
                aria-label="Back to stream"
                className="rounded-full p-1.5 text-white/40 hover:bg-white/[0.06] hover:text-white/80 lg:hidden"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-white/80">{threadTitle}</div>
                <div className="mt-0.5 text-[11px] tabular-nums text-white/35">
                  <span>
                    {threadReplyCount} {threadReplyCount === 1 ? "reply" : "replies"}
                    {thread?.topic?.archived ? " · archived" : ""}
                  </span>
                </div>
              </div>
              <span className="flex shrink-0 items-center gap-1">
                {canWrite && openRoot && (
                  confirmDeleteRoot === openRoot ? (
                    <span className="flex items-center gap-1.5 rounded-full bg-red-500/10 px-2 py-1">
                      <button
                        onClick={() => void deleteRoot(openRoot)}
                        disabled={deletingRoot === openRoot}
                        title="Delete this thread and its replies"
                        className="text-[11px] font-medium text-red-300 hover:text-red-200 disabled:opacity-40"
                      >
                        {deletingRoot === openRoot ? "…" : "Sure?"}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteRoot(null)}
                        aria-label="Cancel delete"
                        className="rounded-full p-0.5 text-white/40 hover:text-white/70"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteRoot(openRoot)}
                      title="Delete this thread and its replies"
                      className="rounded-lg p-1.5 text-white/25 hover:bg-red-500/10 hover:text-red-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )
                )}
                <button
                  onClick={closeThread}
                  className="hidden rounded-full px-2.5 py-1 text-[12px] text-white/40 hover:bg-white/[0.06] hover:text-white/75 lg:block"
                >
                  Close
                </button>
              </span>
            </div>

            {thread?.topic?.archived && (
              <div className="mb-3 rounded-xl bg-white/[0.03] px-3 py-2 text-[12px] text-white/45">
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

            {threadLoading && (
              <div className="flex flex-col gap-3" aria-hidden>
                <span className="text-[12px] text-white/40">Loading thread…</span>
                <div className="animate-pulse rounded-xl bg-white/[0.02] p-4">
                  <div className="h-3 w-2/3 rounded-full bg-white/[0.07]" />
                  <div className="mt-2 h-3 w-full rounded-full bg-white/[0.05]" />
                </div>
              </div>
            )}
            {!threadLoading && !thread && (
              <div className="rounded-xl bg-white/[0.03] p-4 text-center">
                <span className="text-[12px] text-white/40">Thread not found.</span>
              </div>
            )}
            {thread && (
              <div className="flex flex-col">
                {/* Root */}
                <div className="rounded-xl bg-white/[0.04] p-3.5">
                  <div className="flex gap-2.5">
                    <ChatAvatar m={thread.root} size={30} />
                    <div className="min-w-0 flex-1">
                      <MessageHead m={thread.root} />
                      <MessageBody m={thread.root} />
                    </div>
                  </div>
                </div>
                {/* Replies */}
                {thread.replies.length > 0 && (
                  <div className="mt-3 flex flex-col gap-4">
                    {thread.replies.map((m) => {
                      return (
                        <div key={m.id} className="flex gap-2.5 px-1">
                          <div className="flex flex-col items-center">
                            <ChatAvatar m={m} size={28} />
                            <span className="mt-1 w-px flex-1 bg-white/[0.07]" />
                          </div>
                          <div className="min-w-0 flex-1 pb-1">
                            <MessageHead m={m} />
                            <MessageBody m={m} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
                {thread.replies.length === 0 && pendingReplies.length === 0 && (
                  <div className="mt-3 rounded-xl bg-white/[0.02] px-3 py-4 text-center">
                    <span className="text-[12px] text-white/35">No replies yet — start below.</span>
                  </div>
                )}
              </div>
            )}
            {/* Provisional replies (optimistic) — di bawah replies server. */}
            {pendingReplies.length > 0 && (
              <div className={thread ? "mt-3 flex flex-col gap-4 px-1" : "flex flex-col gap-4 px-1"}>
                {pendingReplies.map((p) => (
                  <PendingRow key={p.tempId} p={p} onRetry={retrySend} />
                ))}
              </div>
            )}

            <div className="mt-4 border-t border-white/[0.07] pt-3">
              {canWrite && thread && !thread.topic && (
                <div className="mb-3 rounded-xl bg-white/[0.03] p-2.5">
                  <div className="px-1 text-[11px] font-medium uppercase tracking-[0.12em] text-white/30">
                    <span>Thread goal</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <input
                      value={topicDraft}
                      onChange={(e) => updateTopic({ text: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void saveTopic()
                      }}
                      placeholder="Thread goal title…"
                      disabled={topicBusy}
                      aria-label="Thread goal title"
                      className="min-w-0 flex-1 rounded-xl bg-white/[0.04] px-3 py-1.5 text-[12px] text-white/85 outline-none placeholder:text-white/25 focus:bg-white/[0.06]"
                    />
                    <button
                      onClick={() => void saveTopic()}
                      disabled={topicBusy || !topicDraft.trim()}
                      className="shrink-0 rounded-full bg-white/[0.08] px-3 py-1.5 text-[12px] text-white/75 hover:bg-white/[0.12] disabled:opacity-40"
                    >
                      Title
                    </button>
                  </div>
                </div>
              )}
              {canWrite && thread?.topic && (
                <div className="mb-3 flex items-center gap-2">
                  <button
                    onClick={() => void toggleArchive()}
                    disabled={topicBusy}
                    className="rounded-full bg-white/[0.06] px-3 py-1 text-[11px] text-white/55 hover:bg-white/[0.1] hover:text-white/80 disabled:opacity-40"
                  >
                    {thread.topic.archived ? "Unarchive" : "Archive"}
                  </button>
                  {thread.topic.archived && (
                    <span className="text-[11px] text-white/30">Hidden from Discussions rail</span>
                  )}
                </div>
              )}
              <Composer
                key={openRoot}
                draft={drafts[draftKey] ?? EMPTY_DRAFT}
                updateDraft={updateReply}
                placeholder="Reply… @ for agents"
                disabled={!canWrite || !thread || threadResource.error}
                docs={docs}
                onDispatch={(body) => dispatchSend(openRoot, body)}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
