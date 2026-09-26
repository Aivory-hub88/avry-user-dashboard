"use client"

/**
 * Teams (ADR-019 P1): create a team, and — as its owner — invite people by
 * email. Owners approve the team's project requests; editors can submit
 * them; viewers only read the team's rooms.
 */
import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { X } from "lucide-react"
import { teamsApi, type TeamSummary } from "@/lib/requestsClient"
import { Button, inputClass } from "@/components/requests/requestUi"

type Member = { user_id: string; role: string; email: string | null; full_name: string | null }

const ROLE_LABEL: Record<string, string> = { owner: "Admin", editor: "Member", viewer: "Viewer" }

export default function TeamsPage() {
  const [teams, setTeams] = useState<TeamSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setTeams(await teamsApi.list())
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
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const t = await teamsApi.create(name)
      setTeams((cur) => [...(cur ?? []), t])
      setName("")
    } catch (e) {
      setError((e as Error).message)
    }
    setBusy(false)
  }

  return (
    <div className="flex h-full w-full flex-col bg-surface-1">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-black/10 px-6 text-[13px]">
        <Link href="/workspace/requests" className="text-white/40 hover:text-white/70">
          Requests
        </Link>
        <span className="text-white/20">/</span>
        <span className="font-medium text-white/80">Teams</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[760px] space-y-6 px-8 py-8">
          {error && <div className="rounded-xl bg-amber-500/10 px-4 py-3 text-[12px] text-amber-200">{error}</div>}

          {teams === null ? (
            <div className="h-32 animate-pulse rounded-2xl bg-white/[0.03]" />
          ) : (
            teams.map((t) => <TeamCard key={t.id} team={t} onError={setError} />)
          )}

          <div className="rounded-2xl border border-dashed border-line p-5">
            <div className="text-[13px] font-medium text-white/75">Create a team</div>
            <div className="mt-1 text-[12px] text-white/35">You&apos;ll be its admin and approve its project requests.</div>
            <div className="mt-3 flex max-w-[440px] gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && create()}
                placeholder="Finance team"
                aria-label="Team name"
                className={inputClass}
              />
              <Button tone="primary" disabled={busy || name.trim().length < 2} onClick={create}>
                Create
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function TeamCard({ team, onError }: { team: TeamSummary; onError: (m: string | null) => void }) {
  const isAdmin = team.role === "owner"
  const [members, setMembers] = useState<Member[] | null>(null)
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<"editor" | "viewer" | "owner">("editor")
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!isAdmin) return
    try {
      setMembers((await teamsApi.members(team.id)).members)
    } catch (e) {
      onError((e as Error).message)
    }
  }, [isAdmin, team.id, onError])

  useEffect(() => {
    // Fetch on mount; load() only sets state after its await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const invite = async () => {
    const e = email.trim().toLowerCase()
    if (!e || busy) return
    setBusy(true)
    onError(null)
    try {
      await teamsApi.addMember(team.id, e, role)
      setEmail("")
      await load()
    } catch (err) {
      const msg = (err as Error).message
      onError(msg === "user not found" ? `No Aivory account uses ${e}. Ask them to sign up first.` : msg)
    }
    setBusy(false)
  }

  const remove = async (m: Member) => {
    onError(null)
    try {
      await teamsApi.removeMember(team.id, m.user_id)
      setMembers((cur) => (cur ?? []).filter((x) => x.user_id !== m.user_id))
    } catch (e) {
      onError((e as Error).message)
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-white/[0.02] p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[15px] font-medium text-white/85">{team.name}</div>
        <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-white/50">{ROLE_LABEL[team.role] ?? team.role}</span>
      </div>
      {!isAdmin ? (
        <div className="mt-2 text-[12px] text-white/35">
          {team.role === "editor" ? "You can submit project requests to this team." : "You can view this team's rooms."}
        </div>
      ) : (
        <>
          <div className="mt-4 divide-y divide-line rounded-xl border border-line">
            {(members ?? []).map((m) => (
              <div key={m.user_id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] text-white/80">{m.full_name || m.email || m.user_id}</div>
                  {m.full_name && m.email && <div className="truncate text-[11px] text-white/30">{m.email}</div>}
                </div>
                <span className="text-[11px] text-white/40">{ROLE_LABEL[m.role] ?? m.role}</span>
                {m.user_id !== team.owner && (
                  <button
                    type="button"
                    onClick={() => remove(m)}
                    aria-label={`Remove ${m.email ?? m.user_id}`}
                    className="rounded-full p-1.5 text-white/25 hover:bg-white/[0.06] hover:text-white/70"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && invite()}
              placeholder="name@company.com"
              aria-label="Invite by email"
              className={inputClass}
            />
            <select value={role} onChange={(e) => setRole(e.target.value as typeof role)} aria-label="Role" className={`${inputClass} sm:w-[140px]`}>
              <option value="editor">Member</option>
              <option value="viewer">Viewer</option>
              <option value="owner">Admin</option>
            </select>
            <Button disabled={busy || !email.trim()} onClick={invite}>
              Invite
            </Button>
          </div>
          <div className="mt-2 text-[11px] text-white/30">Members submit requests and join every room. Admins also approve requests.</div>
        </>
      )}
    </div>
  )
}
