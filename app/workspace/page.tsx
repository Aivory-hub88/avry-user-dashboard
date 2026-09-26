"use client"

/**
 * Workspace home (ADR-019 P5): your rooms, and the requests that lead to them.
 *
 * A room is where a team and its agents work on one approved project. New
 * work starts as a request (pick a team, describe it, attach files); a team
 * admin approves it and the room opens. This page replaces the old list of
 * Notion-style pages and the "jump to the latest project" redirect.
 */
import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ChevronRight, Plus, Users } from "lucide-react"
import { AgentAvatar } from "@/components/office/AgentAvatar"
import { collabAuthHeaders } from "@/lib/collabClient"
import { agentDisplayName } from "@/lib/spaceAgent"
import { displayBody, personName } from "@/lib/roomChat"
import { requestsApi, teamsApi, type RequestWithTeam, type TeamSummary } from "@/lib/requestsClient"
import { StatusPill, formatDate } from "@/components/requests/requestUi"

interface RoomSummary {
  id: string
  title: string
  teamName: string
  deadline: string | null
  priority: string | null
  updatedAt: string | null
  last: { at: string | null; kind: string; name: string; body: string } | null
  agents: string[]
  waiting: number
}

function timeAgo(iso: string | null): string {
  if (!iso) return ""
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return "just now"
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`
  return formatDate(iso)
}

function lastLine(r: RoomSummary): string {
  if (!r.last) return "No messages yet"
  const who = r.last.kind === "agent" ? r.last.name || "Agent" : r.last.kind === "system" ? "" : personName(r.last.name)
  const text = displayBody(r.last.body).replace(/\s+/g, " ").trim()
  return who ? `${who}: ${text}` : text
}

export default function WorkspaceHome() {
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null)
  const [teams, setTeams] = useState<TeamSummary[] | null>(null)
  const [mine, setMine] = useState<RequestWithTeam[]>([])
  const [inbox, setInbox] = useState<RequestWithTeam[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [roomsRes, t, m] = await Promise.all([
        fetch("/api/workspace/rooms", { headers: collabAuthHeaders(), cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))),
        teamsApi.list(),
        requestsApi.list("mine"),
      ])
      setRooms((roomsRes as { rooms: RoomSummary[] }).rooms)
      setTeams(t)
      setMine(m)
      if (t.some((x) => x.role === "owner")) setInbox(await requestsApi.list("inbox"))
      setError(null)
    } catch {
      setError("Your workspace couldn't load. Try again in a moment.")
      setRooms((cur) => cur ?? [])
    }
  }, [])

  useEffect(() => {
    // Fetch on mount; load() only sets state after its await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const toReview = useMemo(() => inbox.filter((r) => r.status === "submitted"), [inbox])
  const inProgress = useMemo(() => mine.filter((r) => r.status === "draft" || r.status === "changes_requested" || r.status === "submitted").slice(0, 5), [mine])
  const canRequest = (teams ?? []).some((t) => t.role === "owner" || t.role === "editor")

  return (
    <div className="flex h-full w-full flex-col bg-surface-1">
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-line bg-black/10 px-6">
        <span className="text-[13px] font-medium text-white/85">Workspace</span>
        <div className="flex items-center gap-1">
          <Link href="/workspace/teams" className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] text-white/50 hover:bg-white/[0.06] hover:text-white/80">
            <Users className="h-3.5 w-3.5" />
            <span>Teams</span>
          </Link>
          <Link href="/workspace/requests" className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] text-white/50 hover:bg-white/[0.06] hover:text-white/80">
            <span>Requests</span>
            {toReview.length > 0 && <span className="rounded-full bg-amber-500/20 px-1.5 text-[10px] tabular-nums text-amber-200">{toReview.length}</span>}
          </Link>
          {canRequest && (
            <Link
              href="/workspace/requests?new=1"
              className="ml-1 flex items-center gap-1 rounded-full bg-white px-3.5 py-1.5 text-[12px] font-medium text-black transition-transform duration-150 ease-out hover:bg-white/90 active:scale-[0.97]"
            >
              <Plus className="h-3.5 w-3.5" /> New request
            </Link>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[920px] px-8 py-8">
          {error && <div className="mb-4 rounded-xl bg-amber-500/10 px-4 py-3 text-[12px] text-amber-200">{error}</div>}

          {toReview.length > 0 && (
            <Link
              href="/workspace/requests?tab=inbox"
              className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 transition-colors duration-150 hover:bg-amber-500/[0.1]"
            >
              <span className="text-[13px] text-amber-100/90">
                {toReview.length === 1 ? "1 project request is waiting for your review" : `${toReview.length} project requests are waiting for your review`}
              </span>
              <ChevronRight className="h-4 w-4 text-amber-200/60" />
            </Link>
          )}

          <div className="mb-3 flex items-end justify-between">
            <span className="text-[13px] font-medium text-white/80">Rooms</span>
            {rooms && rooms.length > 0 && <span className="text-[11px] text-white/30">{rooms.length === 1 ? "1 room" : `${rooms.length} rooms`}</span>}
          </div>

          {rooms === null ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-[72px] animate-pulse rounded-xl bg-white/[0.03]" />
              ))}
            </div>
          ) : rooms.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line px-6 py-12 text-center">
              <div className="text-[15px] font-medium text-white/80">No rooms yet</div>
              <div className="mx-auto mt-2 max-w-[460px] text-[13px] leading-relaxed text-white/40">
                A room is where your team and its agents work on one project. Start with a request: describe the project, add its data and files, and a team admin approves it.
              </div>
              <div className="mt-6 flex justify-center gap-2">
                {teams !== null && teams.length === 0 ? (
                  <Link href="/workspace/teams" className="rounded-full bg-white px-4 py-2 text-[12px] font-medium text-black">
                    Create a team
                  </Link>
                ) : (
                  canRequest && (
                    <Link href="/workspace/requests?new=1" className="rounded-full bg-white px-4 py-2 text-[12px] font-medium text-black">
                      Request a project
                    </Link>
                  )
                )}
              </div>
            </div>
          ) : (
            <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">
              {rooms.map((r) => (
                <Link key={r.id} href={`/workspace/${r.id}`} className="group flex items-center gap-4 px-4 py-3.5 transition-colors duration-150 hover:bg-white/[0.03]">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[14px] text-white/85">{r.title}</span>
                      {r.waiting > 0 && (
                        <span className="shrink-0 rounded-full bg-[rgba(255,159,10,0.16)] px-2 py-0.5 text-[10px] font-medium text-[#FFB454]">
                          {r.waiting === 1 ? "1 approval" : `${r.waiting} approvals`}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-[12px] text-white/40">{lastLine(r)}</div>
                    <div className="mt-1 truncate text-[11px] text-white/25">
                      {[r.teamName, r.deadline ? `due ${formatDate(r.deadline)}` : "", timeAgo(r.last?.at ?? r.updatedAt)].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  {r.agents.length > 0 && (
                    <span className="flex shrink-0 items-center" title={r.agents.map(agentDisplayName).join(", ")}>
                      {r.agents.slice(0, 3).map((a, i) => (
                        <span key={a} style={{ marginLeft: i === 0 ? 0 : -6 }} className="rounded-full ring-2 ring-[#18181b]">
                          <AgentAvatar type={a} size={24} />
                        </span>
                      ))}
                    </span>
                  )}
                  <ChevronRight className="h-4 w-4 shrink-0 text-white/15 group-hover:text-white/40" />
                </Link>
              ))}
            </div>
          )}

          {inProgress.length > 0 && (
            <div className="mt-10">
              <div className="mb-3 flex items-end justify-between">
                <span className="text-[13px] font-medium text-white/80">Your requests</span>
                <Link href="/workspace/requests" className="text-[11px] text-white/35 hover:text-white/65">
                  All requests
                </Link>
              </div>
              <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                {inProgress.map((r) => (
                  <Link key={r.id} href={`/workspace/requests/${r.id}`} className="flex items-center gap-4 px-4 py-3 transition-colors duration-150 hover:bg-white/[0.03]">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] text-white/80">{r.title}</div>
                      <div className="mt-0.5 truncate text-[11px] text-white/30">{r.teamName}</div>
                    </div>
                    <StatusPill status={r.status} />
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
