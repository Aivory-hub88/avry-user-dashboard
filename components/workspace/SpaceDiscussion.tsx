/**
 * SpaceDiscussion — mode Discussion di Space view (Phase 1, read-only).
 *
 * Stream root messages lintas-doc + panel kanan thread. Stream kiri tetap
 * di tempat saat thread dibuka (tidak replace, tidak reset scroll).
 * Composer + tulis menyusul di Phase 2 — di sini belum ada input apa pun.
 *
 * Aturan gaya (SCOPE §5.3–5.4): token existing saja (pill bg-white/[0.04],
 * aktif bg-white text-black; aksen AI violet), teks hanya span/div.
 */
"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { collabAuthHeaders } from "@/lib/collabClient"
import { useWorkspaceAwareness } from "@/hooks/useWorkspaceAwareness"
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
          {m.body || <span className="italic text-white/30">(dihapus)</span>}
        </div>
      </div>
    </div>
  )
}

export default function SpaceDiscussion({
  spaceId,
  workspaceId,
  initialThread,
}: {
  spaceId: string
  workspaceId: string | null
  initialThread: string | null
}) {
  const router = useRouter()
  const peers = useWorkspaceAwareness(workspaceId)
  const [roots, setRoots] = useState<RootItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [openRoot, setOpenRoot] = useState<string | null>(initialThread)
  const [thread, setThread] = useState<ThreadPayload | null>(null)
  const [threadLoading, setThreadLoading] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setLoadError(null)
    fetch(`/api/workspace/${spaceId}/stream?limit=50`, { headers: collabAuthHeaders() })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`stream ${r.status}`))))
      .then((j) => {
        if (alive) setRoots(Array.isArray(j.roots) ? j.roots : [])
      })
      .catch(() => {
        if (alive) setLoadError("Could not load discussion.")
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [spaceId])

  const openThread = useCallback(
    (rootId: string) => {
      setOpenRoot(rootId)
      setThread(null)
      setThreadLoading(true)
      router.replace(`/workspace/${spaceId}?view=discussion&thread=${rootId}`, { scroll: false })
      fetch(`/api/workspace/${spaceId}/thread?root=${encodeURIComponent(rootId)}`, {
        headers: collabAuthHeaders(),
      })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`thread ${r.status}`))))
        .then((j) => setThread(j as ThreadPayload))
        .catch(() => setThread(null))
        .finally(() => setThreadLoading(false))
    },
    [router, spaceId],
  )

  useEffect(() => {
    if (initialThread) openThread(initialThread)
    // Hanya deep-link awal — pilihan berikutnya lewat klik.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const closeThread = useCallback(() => {
    setOpenRoot(null)
    setThread(null)
    router.replace(`/workspace/${spaceId}?view=discussion`, { scroll: false })
  }, [router, spaceId])

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
        {loading && <span className="text-[13px] text-white/40">Loading discussion…</span>}
        {loadError && <span className="text-[13px] text-white/40">{loadError}</span>}
        {!loading && !loadError && roots.length === 0 && (
          <div className="rounded-2xl border border-line bg-white/[0.03] p-8 text-center">
            <div className="text-[14px] font-medium text-white/70">Belum ada diskusi</div>
            <div className="mt-1 text-[12px] text-white/35">
              Root message pertama akan muncul di sini. Menulis menyusul di Phase 2.
            </div>
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
      {openRoot && (
        <div className="w-full shrink-0 overflow-y-auto rounded-2xl border border-line bg-white/[0.02] p-4 lg:w-[380px] lg:max-w-[380px]">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[13px] font-medium text-white/75">
              {thread?.topic && !thread.topic.archived ? thread.topic.title : "Thread"}
            </span>
            <button onClick={closeThread} className="text-[12px] text-white/40 hover:text-white/75">
              Tutup
            </button>
          </div>
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
        </div>
      )}
    </div>
  )
}
