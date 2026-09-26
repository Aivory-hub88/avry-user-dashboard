"use client"

/**
 * Project requests list (ADR-019 P1): your requests, and the inbox of teams
 * you own. New requests start here: pick a team, name it, then fill in the
 * rest on the request page (files need a saved request to attach to).
 */
import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ChevronRight, Plus, Users } from "lucide-react"
import { requestsApi, teamsApi, type RequestWithTeam, type TeamSummary } from "@/lib/requestsClient"
import { Button, StatusPill, formatDate, inputClass } from "@/components/requests/requestUi"

type Tab = "mine" | "inbox"

export default function RequestsPage() {
  const router = useRouter()
  const search = useSearchParams()
  const [teams, setTeams] = useState<TeamSummary[] | null>(null)
  const [tab, setTab] = useState<Tab>(search.get("tab") === "inbox" ? "inbox" : "mine")
  const [lists, setLists] = useState<Record<Tab, RequestWithTeam[] | null>>({ mine: null, inbox: null })
  const [error, setError] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)
  const [pickedTeam, setTeamId] = useState("")
  const [title, setTitle] = useState("")
  const [teamName, setTeamName] = useState("")
  const [busy, setBusy] = useState(false)

  const ownsTeam = useMemo(() => (teams ?? []).some((t) => t.role === "owner"), [teams])
  const canRequestIn = useMemo(() => (teams ?? []).filter((t) => t.role === "owner" || t.role === "editor"), [teams])
  const teamId = canRequestIn.some((t) => t.id === pickedTeam) ? pickedTeam : (canRequestIn[0]?.id ?? "")

  const load = useCallback(async () => {
    try {
      const t = await teamsApi.list()
      setTeams(t)
      const owns = t.some((x) => x.role === "owner")
      const [mine, inbox] = await Promise.all([requestsApi.list("mine"), owns ? requestsApi.list("inbox") : Promise.resolve([])])
      setLists({ mine, inbox })
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    // Fetch on mount; load() only sets state after its await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const create = async () => {
    if (!teamId || busy) return
    setBusy(true)
    try {
      const r = await requestsApi.create(teamId, title.trim() || "Untitled request")
      router.push(`/workspace/requests/${r.id}`)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  const createTeam = async () => {
    if (busy) return
    setBusy(true)
    try {
      const t = await teamsApi.create(teamName)
      setTeamName("")
      setTeams((cur) => [...(cur ?? []), t])
      setTeamId(t.id)
      setComposing(true)
    } catch (e) {
      setError((e as Error).message)
    }
    setBusy(false)
  }

  const waiting = (lists.inbox ?? []).filter((r) => r.status === "submitted").length
  const list = lists[tab]

  return (
    <div className="flex h-full w-full flex-col bg-surface-1">
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-line bg-black/10 px-6">
        <div className="flex items-center gap-2 text-[13px]">
          <Link href="/workspace?view=pages" className="text-white/40 hover:text-white/70">
            Workspace
          </Link>
          <span className="text-white/20">/</span>
          <span className="font-medium text-white/80">Requests</span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/workspace/teams"
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] text-white/50 hover:bg-white/[0.06] hover:text-white/80"
          >
            <Users className="h-3.5 w-3.5" />
            <span>Teams</span>
          </Link>
          {canRequestIn.length > 0 && (
            <Button tone="primary" onClick={() => setComposing((v) => !v)}>
              <span className="flex items-center gap-1">
                <Plus className="h-3.5 w-3.5" /> New request
              </span>
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[860px] px-8 py-8">
          {error && <div className="mb-4 rounded-xl bg-amber-500/10 px-4 py-3 text-[12px] text-amber-200">{error}</div>}

          {teams !== null && teams.length === 0 && (
            <div className="mb-8 rounded-2xl border border-line bg-white/[0.02] p-6">
              <div className="text-[15px] font-medium text-white/85">Start with a team</div>
              <div className="mt-1 max-w-[520px] text-[13px] leading-relaxed text-white/45">
                Project requests belong to a team. You&apos;ll be its admin: you approve requests, and each approved request opens a room for the team and its agents.
              </div>
              <div className="mt-4 flex max-w-[420px] gap-2">
                <input
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createTeam()}
                  placeholder="Operations team"
                  aria-label="Team name"
                  className={inputClass}
                />
                <Button tone="primary" disabled={busy || teamName.trim().length < 2} onClick={createTeam}>
                  Create team
                </Button>
              </div>
            </div>
          )}

          {composing && canRequestIn.length > 0 && (
            <div className="mb-8 rounded-2xl border border-line bg-white/[0.02] p-5">
              <div className="text-[13px] font-medium text-white/80">New project request</div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                {canRequestIn.length > 1 && (
                  <select value={teamId} onChange={(e) => setTeamId(e.target.value)} aria-label="Team" className={`${inputClass} sm:w-[200px] sm:shrink-0`}>
                    {canRequestIn.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                )}
                <input
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && create()}
                  placeholder="Odoo rollout for the sales team"
                  aria-label="Request title"
                  className={inputClass}
                />
                <Button tone="primary" disabled={busy} onClick={create}>
                  {busy ? "Creating…" : "Continue"}
                </Button>
              </div>
              <div className="mt-2 text-[11px] text-white/30">You&apos;ll add the goal, data, files, people and agents next. Nothing is sent until you submit.</div>
            </div>
          )}

          {ownsTeam && (
            <div className="mb-4 flex items-center gap-1 rounded-full bg-white/[0.04] p-1 text-[12px] w-fit" role="tablist">
              {(["mine", "inbox"] as Tab[]).map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 ${tab === t ? "bg-white text-black" : "text-white/45 hover:text-white/75"}`}
                >
                  <span>{t === "mine" ? "Your requests" : "To review"}</span>
                  {t === "inbox" && waiting > 0 && (
                    <span className={`rounded-full px-1.5 text-[10px] tabular-nums ${tab === t ? "bg-black/10" : "bg-amber-500/20 text-amber-200"}`}>{waiting}</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {list === null ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-[62px] animate-pulse rounded-xl bg-white/[0.03]" />
              ))}
            </div>
          ) : list.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line px-6 py-12 text-center">
              <div className="text-[13px] text-white/60">{tab === "inbox" ? "Nothing to review" : "No requests yet"}</div>
              <div className="mt-1 text-[12px] text-white/30">
                {tab === "inbox"
                  ? "Requests your team submits will show up here."
                  : canRequestIn.length > 0
                    ? "Ask for a project with its goal, data and files. Once approved it becomes a room."
                    : "Join or create a team to request a project."}
              </div>
            </div>
          ) : (
            <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">
              {list.map((r) => (
                <Link
                  key={r.id}
                  href={`/workspace/requests/${r.id}`}
                  className="group flex items-center gap-4 px-4 py-3 transition-colors duration-150 hover:bg-white/[0.03]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] text-white/85">{r.title}</div>
                    <div className="mt-0.5 truncate text-[11px] text-white/35">
                      {r.teamName}
                      {tab === "inbox" && r.requestedByName ? ` · ${r.requestedByName}` : ""}
                      {r.deadline ? ` · due ${formatDate(r.deadline)}` : ""}
                      {` · updated ${formatDate(r.updatedAt)}`}
                    </div>
                  </div>
                  <StatusPill status={r.status} />
                  <ChevronRight className="h-4 w-4 text-white/20 group-hover:text-white/45" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
