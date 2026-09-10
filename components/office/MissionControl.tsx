"use client"
/**
 * Middle-column overview shown instead of a thread — one card per agent,
 * answering "what's my whole team doing" before committing to any one of
 * them. See docs/CERVEAU-WORKING-OFFICE-PLANNING.md, Phase 9.
 *
 * Deliberately not a new data source: every field on a card (status,
 * pending count, last message, channels) is already fetched by the parent
 * page for the agent column and rail — this just lays the same props out as
 * a grid. Ringan by construction, not by discipline.
 */
import Link from "next/link"
import Image from "next/image"
import { Lock } from "lucide-react"
import { useEffect, useState } from "react"
import * as Y from "yjs"
import { WebsocketProvider } from "y-websocket"
import { asset } from "@/lib/asset"
import { PREBUILT_AGENTS, type AgentDeployment } from "@/lib/agentChat"
import type { ChatSession } from "@/hooks/useChat"
import { readVerifierFinding, type PendingApproval } from "@/lib/agentApprovals"
import { collabAuthHeaders, collabWsParams } from "@/lib/collabClient"
import { ThinkingDots } from "@/components/ui/ThinkingDots"
import { AgentAvatar } from "@/components/office/AgentAvatar"

const CHANNEL_ICON: Record<string, string> = {
  telegram: "/integrations/telegram.svg",
  slack: "/integrations/slack.svg",
}

interface Row {
  key: string
  type: string | null
  title: string
  enterprise?: boolean
}

type Activity = {
  id: number
  actor_type: "user" | "agent" | "system"
  actor_name: string | null
  summary: string
  created_at: string
}

const ROWS: Row[] = [
  { key: "null", type: null, title: "Aivory Console" },
  ...PREBUILT_AGENTS.map((a) => ({ key: a.type, type: a.type, title: a.title, enterprise: a.enterprise })),
]

function relativeTime(ts: number): string {
  const diffMs = Date.now() - ts
  const mins = Math.round(diffMs / 60_000)
  if (mins < 1) return "now"
  if (mins < 60) return `${mins}m`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.round(hours / 24)}d`
}

function lastPreview(session: ChatSession | undefined): string {
  if (!session || session.messages.length === 0) return "No conversations yet"
  const last = session.messages[session.messages.length - 1]
  const text = last.content.replace(/\s+/g, " ").trim()
  return text.length > 56 ? `${text.slice(0, 56)}…` : text || "New chat"
}

interface MissionControlProps {
  workspaceId: string | null
  sessionsByAgent: Record<string, ChatSession[]>
  approvalsByAgent: Record<string, PendingApproval[]>
  deployments: AgentDeployment[]
  streamingAgentType: string | null | undefined
  onOpenAgent: (agentType: string | null) => void
}

export default function MissionControl({
  workspaceId,
  sessionsByAgent,
  approvalsByAgent,
  deployments,
  streamingAgentType,
  onOpenAgent,
}: MissionControlProps) {
  const [wsRows, setWsRows] = useState<{ id: string; title: string; status: string; priority: string }[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [wsBusy, setWsBusy] = useState<string | null>(null)
  const [awarenessPeers, setAwarenessPeers] = useState<Array<{ name: string; color: string; agentType: string }>>([])
  const [, forceNow] = useState(0)
  useEffect(() => {
    const id = setInterval(() => forceNow((n) => n + 1), 60000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    let alive = true
    const load = async () => {
       try {
         if (!workspaceId) {
           setWsRows([])
           setActivities([])
           return
         }
         const r = await fetch(`/api/workspace/${workspaceId}/database`, { headers: collabAuthHeaders() })
         const activityResponse = await fetch(`/api/workspace/${workspaceId}/activity`, { headers: collabAuthHeaders() })
         if (alive && r.ok) {
           const j = await r.json()
           setWsRows((j.rows ?? []).slice(0, 3))
         }
         if (alive && activityResponse.ok) {
           const j = await activityResponse.json()
           setActivities((j.activities ?? []).slice(0, 6))
         }
      } catch {}
    }
    load()
    const t = setInterval(load, 5000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [workspaceId])

  useEffect(() => {
    if (!workspaceId) {
      // Reset presence when the active workspace is cleared.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAwarenessPeers([])
      return
    }
    const wsUrl =
      typeof window !== "undefined" && window.location.hostname === "localhost"
        ? "ws://localhost:3200"
        : "wss://aivory.uk/yjs"
    const doc = new Y.Doc()
    let provider: WebsocketProvider | null = null
    try {
      provider = new WebsocketProvider(wsUrl, `workspace:${workspaceId}`, doc, { connect: true, params: collabWsParams() })
      const updatePeers = () => {
        const peers = Array.from(provider!.awareness.getStates().values())
          .map((s: unknown) => (s as { user?: { name: string; color: string; agentType: string } })?.user)
          .filter(Boolean) as Array<{ name: string; color: string; agentType: string }>
        setAwarenessPeers(peers)
      }
      provider.awareness.on("change", updatePeers)
      updatePeers()
    } catch {}
    return () => {
      provider?.destroy()
      doc.destroy()
    }
  }, [workspaceId])

  const actOnRow = async (rowId: string, status: string) => {
    setWsBusy(rowId)
    try {
      if (!workspaceId) return
      await fetch(`/api/workspace/${workspaceId}/database/${rowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...collabAuthHeaders() },
        body: JSON.stringify({ status }),
      })
       const r = await fetch(`/api/workspace/${workspaceId}/database`, { headers: collabAuthHeaders() })
      if (r.ok) {
        const j = await r.json()
        setWsRows((j.rows ?? []).slice(0, 3))
      }
    } finally {
      setWsBusy(null)
    }
  }

  const visibleAwarenessPeers = workspaceId ? awarenessPeers : []

  return (
    <div className="flex-1 overflow-y-auto px-8 py-10">
      <div className="mx-auto max-w-[1000px]">
        {/* Not <h1>/<p> — global `main h1`/`main p` styles override
            font-size/color/margin on any heading or paragraph tag here. */}
        <div
          className="mb-1 font-light text-[28px] leading-tight text-white/90"
          style={{ fontFamily: "var(--font-manrope), sans-serif", fontWeight: 300, letterSpacing: "-0.02em" }}
        >
          Mission Control
        </div>
        <div className="mb-8 text-[13px] font-light text-white/40">
          Every agent, at a glance — pick one to open its thread.
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ROWS.map((row) => {
            const threads = sessionsByAgent[row.key] ?? []
            const mostRecent = threads[0]
            const approvals = approvalsByAgent[row.key] ?? []
            const pending = approvals.length
            // ADR-008 Phase 3a: an approval `verifier_brain` flagged is still
            // just one of the pending ones — the count badge already carries
            // "how many". What the glance view was missing is "is any of them
            // worth opening first", so the status line says that instead.
            // Reading it off the approvals already passed in keeps this view's
            // no-new-data-source rule intact.
            const flagged = approvals.some((a) => readVerifierFinding(a)?.verdict === "flag")
            const channels = row.type
              ? [...new Set(deployments.filter((d) => d.agentType === row.type).map((d) => d.kind))]
              : []
            const isThinking = row.type === streamingAgentType
            const status = isThinking
              ? "Thinking…"
              : flagged
                ? "Flagged"
                : pending > 0
                  ? "Needs you"
                  : "Idle"
            const statusColor = pending > 0 ? "text-amber" : isThinking ? "text-white/60" : "text-white/35"

            return (
              <button
                key={row.key}
                onClick={() => onOpenAgent(row.type)}
                className="group flex flex-col gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5 text-left transition-colors hover:border-white/[0.14] hover:bg-white/[0.05]"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-3">
                    {isThinking ? (
                      <div className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full bg-white/[0.06]">
                        <ThinkingDots size={12} dotSize={2} />
                      </div>
                    ) : (
                      <AgentAvatar type={row.type} size={38} />
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-[6px]">
                        <span className="truncate text-[14px] font-medium text-white">{row.title}</span>
                        {row.enterprise && <Lock className="h-[11px] w-[11px] shrink-0 text-amber-warn/90" />}
                      </div>
                      <span className={`text-[11.5px] font-light ${statusColor}`}>{status}</span>
                    </div>
                  </div>
                  {pending > 0 && (
                    <span className="shrink-0 rounded-full bg-amber/15 px-[8px] py-[3px] text-[11px] font-semibold text-amber">
                      {pending}
                    </span>
                  )}
                </div>

                <div className="truncate text-[12.5px] font-light text-white/40">{lastPreview(mostRecent)}</div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-[6px]">
                    {channels.length === 0 ? (
                      <span className="text-[10.5px] font-light text-white/25">Not deployed</span>
                    ) : (
                      channels.map((k) =>
                        CHANNEL_ICON[k] ? (
                          <Image
                            key={k}
                            src={asset(CHANNEL_ICON[k])}
                            alt={k}
                            width={13}
                            height={13}
                            className="rounded-[3px] opacity-70"
                          />
                        ) : (
                          <span key={k} className="text-[10px] uppercase tracking-wider text-white/25">
                            {k}
                          </span>
                        )
                      )
                    )}
                  </div>
                  {mostRecent && (
                    <span className="text-[10.5px] font-light tabular-nums text-white/25">
                      {relativeTime(mostRecent.updatedAt)}
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>

         {/* Workspace activity and active collaborators */}
        {visibleAwarenessPeers.length > 0 && (
          <div className="mt-8">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] text-white/30">
              <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
              <span>
                 {visibleAwarenessPeers.map((p) => p.name).join(" · ")} · {visibleAwarenessPeers.length} active collaborator{visibleAwarenessPeers.length !== 1 ? "s" : ""}
              </span>
              <span className="ml-1 flex items-center gap-1">
                 {visibleAwarenessPeers.map((p, i) => (
                  <span
                    key={i}
                    className="h-2 w-2 rounded-full border border-white/10"
                    style={{ background: p.color }}
                    title={`${p.name} (${p.agentType})`}
                  />
                ))}
              </span>
            </div>
          </div>
        )}
        {activities.length > 0 && (
          <div className="mt-8">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-[12px] font-medium uppercase tracking-wider text-white/40">Recent activity</span>
              <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-white/40">{activities.length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {activities.map((activity) => (
                <div key={activity.id} className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3.5 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-[12px] font-medium text-white/70">{activity.actor_name ?? activity.actor_type}</span>
                    <span className="shrink-0 text-[10px] text-white/25">{relativeTime(new Date(activity.created_at).getTime())}</span>
                  </div>
                  <div className="mt-1 text-[12px] text-white/45">{activity.summary}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {wsRows.length > 0 && (
          <div className="mt-8">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-[12px] font-medium uppercase tracking-wider text-white/40">Workspace · Leads DB</span>
              <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-white/40">{wsRows.length}</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {wsRows.map((r) => (
                <div key={r.id} className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] font-medium text-white/85">{r.title || "Untitled"}</span>
                    <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[11px] text-white/50">{r.status}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-white/30">
                    {r.priority} · {r.status === "Todo" ? "needs review" : r.status}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => actOnRow(r.id, "Doing")}
                      disabled={!!wsBusy}
                      className="rounded-full bg-white px-3 py-1.5 text-[12px] font-medium text-black hover:bg-white/90 disabled:opacity-50"
                    >
                      {wsBusy === r.id ? "…" : "Approve → Doing"}
                    </button>
                    <button
                      onClick={() => actOnRow(r.id, "Todo")}
                      disabled={!!wsBusy}
                      className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[12px] text-white/60 hover:bg-white/[0.06] disabled:opacity-50"
                    >
                      Keep Todo
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 text-[11px] text-white/25">
               <Link href={workspaceId ? `/workspace/${workspaceId}?view=database` : "/workspace"} className="underline decoration-white/20 underline-offset-2 hover:text-white/50">
                 Open Data
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
