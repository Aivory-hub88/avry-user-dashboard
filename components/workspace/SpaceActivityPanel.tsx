/**
 * SpaceActivityPanel — panel Activity di kanan Discussion (wireframe F5).
 *
 * "What's new for me": kartu NotificationCard per tone (mention biru info,
 * reply info, here info) + Mark all read. Klik kartu → buka thread-nya.
 * Poll 30 detik (lebih jarang dari panel thread — inbox bukan live chat).
 */
"use client"

import { useCallback, useEffect, useState } from "react"
import { collabAuthHeaders } from "@/lib/collabClient"
import { NotificationCard } from "@/components/office/NotificationCard"
import { timeAgo, KIND_META, POLL_MS, type ActivityKind } from "@/lib/spaceUi"

export interface SpaceActivityItem {
  kind: "mention" | "here" | "reply"
  spaceId: string
  threadRoot: string
  messageId: string
  authorName: string
  excerpt: string
  createdAt: string
  unread: boolean
}

export default function SpaceActivityPanel({
  onOpenThread,
}: {
  onOpenThread: (threadRoot: string, spaceId?: string) => void
}) {
  const [items, setItems] = useState<SpaceActivityItem[]>([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(true)
  const [marking, setMarking] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/workspace/activity?limit=30", {
        headers: collabAuthHeaders(),
      })
      if (r.ok) {
        const j = await r.json()
        setItems(Array.isArray(j.items) ? j.items : [])
        setUnread(typeof j.unread === "number" ? j.unread : 0)
      }
    } catch {
      // diam — poll berikutnya mencoba lagi
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), POLL_MS.activityPanel)
    return () => clearInterval(timer)
  }, [load])

  const markAllRead = useCallback(async () => {
    if (marking) return
    setMarking(true)
    try {
      const spaces = [...new Set(items.map((i) => i.spaceId))]
      const results = await Promise.all(
        spaces.map((spaceId) =>
          fetch("/api/workspace/activity", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...collabAuthHeaders() },
            body: JSON.stringify({ spaceId }),
          })
            .then((r) => r.ok)
            .catch(() => false),
        ),
      )
      if (results.length === 0 || results.every(Boolean)) {
        setItems([])
        setUnread(0)
      }
    } catch {
      // diam
    }
    setMarking(false)
  }, [items, marking])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/35">
          What&apos;s new{unread > 0 ? ` · ${unread}` : ""}
        </span>
        {items.length > 0 && (
          <button
            onClick={() => void markAllRead()}
            disabled={marking}
            className="rounded-full bg-white/[0.06] px-3 py-1 text-[11px] text-white/55 hover:bg-white/[0.1] hover:text-white/80 disabled:opacity-40"
          >
            Mark all read
          </button>
        )}
      </div>
      {loading && <span className="text-[12px] text-white/40">Loading activity…</span>}
      {!loading && items.length === 0 && (
        <span className="text-[12px] text-white/35">You&apos;re all caught up.</span>
      )}
      {items.map((s) => {
        const meta = KIND_META[s.kind as ActivityKind]
        return (
          <NotificationCard
            key={s.messageId}
            tone={meta.tone}
            badge={meta.badge}
          icon={<span className="text-[14px] leading-none">@</span>}
          title={
            <span className="text-[13.5px] font-semibold text-white">
              {s.authorName}
              <span className="font-normal text-white/50">
                {" "}
                {s.kind === "mention"
                  ? "mentioned you"
                  : s.kind === "here"
                    ? "notified everyone"
                    : "replied"}
              </span>
            </span>
          }
          subtitle={s.excerpt ? <span>{s.excerpt}</span> : undefined}
          meta={timeAgo(s.createdAt)}
          onClick={() => onOpenThread(s.threadRoot, s.spaceId)}
        />
        )
      })}
    </div>
  )
}
