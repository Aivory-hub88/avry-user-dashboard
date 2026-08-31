"use client"
/**
 * Left column of the Console "working office" — every agent the user can
 * talk to, each expanding to its own threads. Supersedes the old
 * AgentSelector dropdown in ConsoleTopBar: one place to switch agents,
 * not two.
 */
import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import { ChevronRight, ChevronLeft, Lock, Plus, Trash2 } from "lucide-react"
import { asset } from "@/lib/asset"
import { PREBUILT_AGENTS, listDeployments, type AgentDeployment } from "@/lib/agentChat"
import type { ChatSession } from "@/hooks/useChat"
import type { PendingApproval } from "@/lib/agentApprovals"
import { ThinkingDots } from "@/components/ui/ThinkingDots"
import { AgentAvatar } from "@/components/office/AgentAvatar"
import { useAgentColumnCollapse } from "@/hooks/useAgentColumnCollapse"

const CHANNEL_ICON: Record<string, string> = {
  telegram: "/integrations/telegram.svg",
  slack: "/integrations/slack.svg",
}

interface AgentColumnProps {
  sessionsByAgent: Record<string, ChatSession[]>
  approvalsByAgent: Record<string, PendingApproval[]>
  approvalsLoaded: boolean
  currentSessionId: string
  agentTarget: string | null
  streamingAgentType: string | null | undefined
  setAgentTarget: (agent: string | null) => void
  switchSession: (sessionId: string) => void
  handleNewChat: () => void
  deleteThread: (sessionId: string) => void
}

interface Row {
  key: string
  type: string | null
  title: string
  enterprise?: boolean
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
  if (!session || session.messages.length === 0) return "No messages yet"
  const last = session.messages[session.messages.length - 1]
  const text = last.content.replace(/\s+/g, " ").trim()
  return text.length > 44 ? `${text.slice(0, 44)}…` : text || "New chat"
}

export default function AgentColumn({
  sessionsByAgent,
  approvalsByAgent,
  approvalsLoaded,
  currentSessionId,
  agentTarget,
  streamingAgentType,
  setAgentTarget,
  switchSession,
  handleNewChat,
  deleteThread,
}: AgentColumnProps) {
  const [expanded, setExpanded] = useState<string>(agentTarget ?? "null")
  const [deployments, setDeployments] = useState<AgentDeployment[]>([])
  const [query, setQuery] = useState("")
  const [arrived, setArrived] = useState<Set<string>>(new Set())
  const { collapsed, toggle } = useAgentColumnCollapse()
  const fetchedRef = useRef(false)
  const approvalsInitRef = useRef(false)
  const prevCountsRef = useRef<Record<string, number>>({})

  useEffect(() => {
    // Skip the pulse on the very first snapshot — that's existing work
    // surfacing, not something that just "arrived". Only count increases
    // after that baseline count as an arrival.
    if (!approvalsLoaded) return
    if (!approvalsInitRef.current) {
      approvalsInitRef.current = true
      for (const row of ROWS) prevCountsRef.current[row.key] = approvalsByAgent[row.key]?.length ?? 0
      return
    }
    const next = new Set<string>()
    for (const row of ROWS) {
      const count = approvalsByAgent[row.key]?.length ?? 0
      if (count > (prevCountsRef.current[row.key] ?? 0)) next.add(row.key)
      prevCountsRef.current[row.key] = count
    }
    if (next.size === 0) return
    // Sync-from-external-data pattern: this state exists purely to reflect
    // a transient change detected in props, same convention used elsewhere
    // in this file and in useChat.ts's session-restore effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setArrived(next)
    const t = setTimeout(() => setArrived(new Set()), 2900)
    return () => clearTimeout(t)
  }, [approvalsByAgent, approvalsLoaded])

  useEffect(() => {
    // Channel badges are decorative — fetch once, not per row.
    if (fetchedRef.current) return
    fetchedRef.current = true
    listDeployments().then(setDeployments).catch(() => {})
  }, [])

  useEffect(() => {
    // Sync-from-prop: agentTarget can change from outside this component
    // (e.g. restored from a persisted session on mount) — same documented
    // pattern as useChat.ts's session-restore effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExpanded(agentTarget ?? "null")
  }, [agentTarget])

  const channelsFor = (type: string | null) =>
    type ? [...new Set(deployments.filter((d) => d.agentType === type).map((d) => d.kind))] : []

  const openAgent = (row: Row) => {
    const threads = sessionsByAgent[row.key] ?? []
    if (row.type === agentTarget) {
      setExpanded((e) => (e === row.key ? "" : row.key))
      return
    }
    setExpanded(row.key)
    if (threads.length > 0) {
      switchSession(threads[0].id)
    } else {
      handleNewChat()
      setAgentTarget(row.type)
    }
  }

  const startThread = (row: Row, e: React.MouseEvent) => {
    e.stopPropagation()
    setExpanded(row.key)
    handleNewChat()
    setAgentTarget(row.type)
  }

  const q = query.trim().toLowerCase()
  const matchesQuery = (row: Row, threads: ChatSession[]) =>
    !q ||
    row.title.toLowerCase().includes(q) ||
    threads.some((t) => (t.title || "").toLowerCase().includes(q))

  if (collapsed) {
    return (
      <div className="flex h-full w-14 shrink-0 flex-col items-center border-r border-white/[0.045] bg-[#353531] pt-4">
        <button
          onClick={toggle}
          aria-label="Expand agent column"
          title="Expand agent column"
          className="mb-3 grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[8px] text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          <ChevronRight className="h-[14px] w-[14px]" />
        </button>
        <div className="flex flex-1 flex-col items-center gap-[6px] overflow-y-auto pb-4">
          {ROWS.map((row) => {
            const isActiveAgent = row.type === agentTarget
            const pending = approvalsByAgent[row.key]?.length ?? 0
            return (
              <button
                key={row.key}
                onClick={() => openAgent(row)}
                title={row.title}
                className={`relative grid h-9 w-9 shrink-0 place-items-center rounded-full transition-[box-shadow] ${
                  isActiveAgent ? "ring-2 ring-white/25" : "hover:ring-2 hover:ring-white/10"
                }`}
              >
                {row.type === streamingAgentType ? (
                  <div className="grid h-full w-full place-items-center rounded-full bg-white/[0.06]">
                    <ThinkingDots size={11} dotSize={1.8} />
                  </div>
                ) : (
                  <AgentAvatar type={row.type} size={36} />
                )}
                {pending > 0 && (
                  <span
                    className={`absolute -right-0.5 -top-0.5 rounded-full bg-[#d9ab6e] px-[4px] text-[9px] font-bold leading-[13px] text-[#2b2b28] ${
                      arrived.has(row.key) ? "pending-badge-arrived" : ""
                    }`}
                  >
                    {pending}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full w-[264px] shrink-0 flex-col border-r border-white/[0.045] bg-[#353531]">
      <div className="flex items-center justify-between gap-2 px-4 pt-5 pb-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">Your Agents</h2>
        <button
          onClick={toggle}
          aria-label="Collapse agent column"
          title="Collapse agent column"
          className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[7px] text-white/30 transition-colors hover:bg-white/[0.08] hover:text-white"
        >
          <ChevronLeft className="h-[13px] w-[13px]" />
        </button>
      </div>
      <div className="px-4 pb-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search agents and threads"
          aria-label="Search agents and threads"
          className="w-full rounded-[9px] border border-white/[0.045] bg-white/[0.04] px-[11px] py-[7px] text-[12.5px] font-light text-white placeholder:text-white/30 focus:border-accent/40 focus:bg-white/[0.06] focus:outline-none"
        />
      </div>
      <div className="flex-1 overflow-y-auto px-[10px] pb-4">
        {ROWS.map((row) => {
          const threads = sessionsByAgent[row.key] ?? []
          if (!matchesQuery(row, threads)) return null
          const isOpen = expanded === row.key
          const isActiveAgent = row.type === agentTarget
          const channels = channelsFor(row.type)
          const pending = approvalsByAgent[row.key]?.length ?? 0
          const mostRecent = threads[0]
          const isThinkingHere = row.type === streamingAgentType
          return (
            <div key={row.key} className="mb-0.5 w-full">
              <button
                onClick={() => openAgent(row)}
                className={`group flex w-full items-start gap-[9px] rounded-[10px] px-[9px] py-[8px] text-left transition-colors ${
                  isActiveAgent ? "bg-[#414039]" : "hover:bg-white/[0.04]"
                }`}
              >
                <ChevronRight
                  className={`mt-[9px] h-[12px] w-[12px] shrink-0 text-white/25 transition-transform ${isOpen ? "rotate-90" : ""}`}
                />
                <AgentAvatar type={row.type} size={30} className="mt-[1px]" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-[6px]">
                    <span
                      className={`min-w-0 flex-1 truncate text-[13.5px] ${isActiveAgent ? "font-medium text-white" : "font-normal text-white/80"}`}
                    >
                      {row.title}
                    </span>
                    {row.enterprise && <Lock className="h-[10.5px] w-[10.5px] shrink-0 text-[#e8b96a]/90" />}
                    {mostRecent && (
                      <span className="shrink-0 text-[10.5px] font-light tabular-nums text-white/30">
                        {relativeTime(mostRecent.updatedAt)}
                      </span>
                    )}
                  </span>
                  <span className="mt-[2px] flex items-center gap-[5px]">
                    {isThinkingHere ? (
                      <>
                        <ThinkingDots size={9} dotSize={1.6} />
                        <span className="truncate text-[12px] font-light text-white/45">thinking…</span>
                      </>
                    ) : (
                      <span className="truncate text-[12px] font-light text-white/35">
                        {mostRecent ? lastPreview(mostRecent) : "No conversations yet"}
                      </span>
                    )}
                  </span>
                </span>
                <span className="mt-[1px] flex shrink-0 items-center gap-[6px]">
                  {pending > 0 && (
                    <span
                      className={`rounded-full bg-[rgba(217,171,110,0.13)] px-[6px] py-[1px] text-[10.5px] font-semibold text-[#d9ab6e] ${
                        arrived.has(row.key) ? "pending-badge-arrived" : ""
                      }`}
                    >
                      {pending}
                    </span>
                  )}
                  <span
                    onClick={(e) => startThread(row, e)}
                    role="button"
                    aria-label={`New thread with ${row.title}`}
                    className="grid h-[20px] w-[20px] shrink-0 place-items-center rounded-[7px] text-white/30 opacity-0 transition-opacity hover:bg-white/[0.1] hover:text-white group-hover:opacity-100"
                  >
                    <Plus className="h-[12px] w-[12px]" />
                  </span>
                </span>
              </button>

              {isOpen && (
                <div className="flex flex-col gap-[1px] py-[2px] pl-[26px]">
                  {threads.length === 0 ? (
                    <span className="px-[10px] py-1 text-[12px] font-light text-white/25">No threads yet</span>
                  ) : (
                    threads.map((t) => {
                      const active = t.id === currentSessionId
                      return (
                        <div
                          key={t.id}
                          className={`group/thread flex items-center gap-[4px] rounded-[8px] pr-[6px] transition-colors ${
                            active ? "bg-white/[0.05]" : "hover:bg-white/[0.035]"
                          }`}
                        >
                          <button
                            onClick={() => switchSession(t.id)}
                            className="min-w-0 flex-1 py-[5px] pl-[10px] text-left"
                          >
                            <span
                              className={`block truncate text-[12.5px] font-light ${
                                active ? "text-white" : "text-white/45 group-hover/thread:text-white/70"
                              }`}
                            >
                              {t.title || "New chat"}
                            </span>
                            <span className="block truncate text-[11px] font-light text-white/25">
                              {lastPreview(t)} · {relativeTime(t.updatedAt)}
                            </span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              if (confirm(`Delete "${t.title || "New chat"}"? This cannot be undone.`)) {
                                deleteThread(t.id)
                              }
                            }}
                            aria-label={`Delete ${t.title || "thread"}`}
                            className="grid h-[20px] w-[20px] shrink-0 place-items-center self-start rounded-[6px] text-white/25 opacity-0 transition-opacity hover:bg-white/[0.1] hover:text-white/80 group-hover/thread:opacity-100"
                          >
                            <Trash2 className="h-[11px] w-[11px]" />
                          </button>
                        </div>
                      )
                    })
                  )}
                </div>
              )}
              {isOpen && channels.length > 0 && (
                <div className="flex items-center gap-[6px] px-[10px] pb-1 pl-[26px]">
                  {channels.map((k) =>
                    CHANNEL_ICON[k] ? (
                      <Image key={k} src={asset(CHANNEL_ICON[k])} alt={k} width={12} height={12} className="rounded-[2px] opacity-70" />
                    ) : (
                      <span key={k} className="text-[10px] uppercase tracking-wider text-white/25">{k}</span>
                    )
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
