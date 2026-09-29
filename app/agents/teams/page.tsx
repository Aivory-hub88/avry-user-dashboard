'use client'

/**
 * Agent Teams (ADR-020): pick agents, name the group, attach it to channels.
 * Agents in a Team discover each other and delegate only within it. Owner-only
 * by construction: the backend scopes every call to the signed-in user.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AGENT_ROSTER } from '@/lib/agentRoster'
import { collabAuthHeaders } from '@/lib/collabClient'
import { listDeployments } from '@/lib/agentChat'
import {
  attachTeamChannel,
  boundElsewhere,
  createAgentTeam,
  deleteAgentTeam,
  detachTeamChannel,
  listAgentTeams,
  updateAgentTeam,
  type AgentTeam,
  type AgentTeamChannel,
} from '@/lib/agentTeams'

interface ChannelOption {
  kind: AgentTeamChannel['kind']
  ref: string
  label: string
}

const KIND_LABEL: Record<AgentTeamChannel['kind'], string> = { workspace: 'Room', telegram: 'Telegram' }

const agentName = (type: string) => AGENT_ROSTER.find((a) => a.type === type)?.name ?? type

function AgentChips({
  selected,
  onToggle,
  disabled,
}: {
  selected: string[]
  onToggle: (type: string) => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {AGENT_ROSTER.map((a) => {
        const on = selected.includes(a.type)
        return (
          <button
            key={a.type}
            type="button"
            disabled={disabled}
            aria-pressed={on}
            onClick={() => onToggle(a.type)}
            className={`rounded-full border px-3 py-1 text-[12px] transition-colors disabled:opacity-50 ${
              on
                ? 'border-[#b7cba6]/60 bg-[#b7cba6]/15 text-white'
                : 'border-line text-white/55 hover:bg-white/[0.06] hover:text-white/80'
            }`}
          >
            {a.name}
            <span className="ml-1.5 text-white/35">{a.title}</span>
          </button>
        )
      })}
    </div>
  )
}

function TeamCard({
  team,
  allTeams,
  options,
  onChange,
  onDeleted,
  onError,
}: {
  team: AgentTeam
  allTeams: AgentTeam[]
  options: ChannelOption[]
  onChange: (t: AgentTeam) => void
  onDeleted: (id: string) => void
  onError: (m: string | null) => void
}) {
  const [name, setName] = useState(team.name)
  const [busy, setBusy] = useState(false)

  const run = async (fn: () => Promise<AgentTeam | void>) => {
    setBusy(true)
    onError(null)
    try {
      const next = await fn()
      if (next) onChange(next)
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Something went wrong')
    }
    setBusy(false)
  }

  const taken = useMemo(() => boundElsewhere(allTeams, team.id), [allTeams, team.id])
  const mine = new Set(team.channels.map((c) => `${c.kind}:${c.ref}`))
  const attachable = options.filter((o) => !mine.has(`${o.kind}:${o.ref}`) && !taken.has(`${o.kind}:${o.ref}`))
  const labelFor = (c: AgentTeamChannel) =>
    options.find((o) => o.kind === c.kind && o.ref === c.ref)?.label ?? c.ref

  const toggleAgent = (type: string) => {
    const has = team.agent_types.includes(type)
    const next = has ? team.agent_types.filter((t) => t !== type) : [...team.agent_types, type]
    if (next.length === 0) return onError('A team needs at least one agent.')
    void run(() => updateAgentTeam(team.id, { agent_types: next }))
  }

  return (
    <section className="rounded-2xl border border-line bg-white/[0.03] p-5">
      <div className="flex items-center gap-3">
        <input
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const trimmed = name.trim()
            if (!trimmed) return setName(team.name)
            if (trimmed !== team.name) void run(() => updateAgentTeam(team.id, { name: trimmed }))
          }}
          aria-label="Team name"
          className="min-w-0 flex-1 rounded-lg bg-transparent px-2 py-1 text-[15px] font-medium text-white/90 outline-none focus:bg-white/[0.06]"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (window.confirm(`Delete “${team.name}”? Its channels go back to using all your agents.`))
              void run(async () => {
                await deleteAgentTeam(team.id)
                onDeleted(team.id)
              })
          }}
          className="rounded-full px-3 py-1 text-[12px] text-white/45 hover:bg-white/[0.06] hover:text-white/80 disabled:opacity-50"
        >
          Delete
        </button>
      </div>

      <div className="mt-4">
        <div className="mb-2 text-[12px] text-white/45">Agents in this team</div>
        <AgentChips selected={team.agent_types} onToggle={toggleAgent} disabled={busy} />
      </div>

      <label className="mt-4 flex cursor-pointer items-start gap-2 text-[12px] text-white/60">
        <input
          type="checkbox"
          checked={team.isolated}
          disabled={busy}
          onChange={(e) => void run(() => updateAgentTeam(team.id, { isolated: e.target.checked }))}
          className="mt-0.5"
        />
        <span>
          Keep the team together
          <span className="block text-white/35">
            On: in its channels these agents work only with each other. Off: they can also reach every
            other agent you have deployed.
          </span>
        </span>
      </label>

      <div className="mt-4">
        <div className="mb-2 text-[12px] text-white/45">Channels</div>
        {team.channels.length === 0 ? (
          <div className="text-[12px] text-white/35">Not attached anywhere yet.</div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {team.channels.map((c) => (
              <li key={`${c.kind}:${c.ref}`} className="flex items-center gap-2 text-[13px] text-white/75">
                <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-white/50">
                  {KIND_LABEL[c.kind]}
                </span>
                <span className="min-w-0 flex-1 truncate">{labelFor(c)}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => detachTeamChannel(team.id, c))}
                  className="text-[12px] text-white/40 hover:text-white/80 disabled:opacity-50"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        {attachable.length > 0 && (
          <select
            aria-label="Attach a channel"
            disabled={busy}
            value=""
            onChange={(e) => {
              const o = attachable.find((x) => `${x.kind}:${x.ref}` === e.target.value)
              if (o) void run(() => attachTeamChannel(team.id, { kind: o.kind, ref: o.ref }))
            }}
            className="mt-3 rounded-lg border border-line bg-surface-1 px-3 py-1.5 text-[12px] text-white/70"
          >
            <option value="">Attach a room or chat…</option>
            {attachable.map((o) => (
              <option key={`${o.kind}:${o.ref}`} value={`${o.kind}:${o.ref}`}>
                {KIND_LABEL[o.kind]} · {o.label}
              </option>
            ))}
          </select>
        )}
      </div>
    </section>
  )
}

export default function AgentTeamsPage() {
  const [teams, setTeams] = useState<AgentTeam[] | null>(null)
  const [options, setOptions] = useState<ChannelOption[]>([])
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    try {
      setTeams(await listAgentTeams())
      setError(null)
    } catch (e) {
      setTeams((cur) => cur ?? [])
      setError(e instanceof Error ? e.message : 'Your teams could not load.')
    }
    const opts: ChannelOption[] = []
    try {
      const r = await fetch('/api/workspace/rooms', { headers: collabAuthHeaders(), cache: 'no-store' })
      if (r.ok) {
        const data = (await r.json()) as { rooms?: { id: string; title: string }[] }
        for (const room of data.rooms ?? []) opts.push({ kind: 'workspace', ref: room.id, label: room.title })
      }
    } catch {
      // rooms are optional here
    }
    try {
      for (const d of await listDeployments()) {
        if (d.kind === 'telegram') opts.push({ kind: 'telegram', ref: d.id, label: d.label })
      }
    } catch {
      // chats are optional here
    }
    setOptions(opts)
  }, [])

  useEffect(() => {
    // Fetch on mount; load() only sets state after its awaits.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const create = async () => {
    const trimmed = name.trim()
    if (!trimmed || picked.length === 0 || creating) return
    setCreating(true)
    setError(null)
    try {
      const team = await createAgentTeam({ name: trimmed, agent_types: picked })
      setTeams((cur) => [...(cur ?? []), team])
      setName('')
      setPicked([])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the team.')
    }
    setCreating(false)
  }

  return (
    <div className="min-h-screen w-full overflow-y-auto bg-[var(--bg-main)] text-white">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-black/10 px-6">
        <Link href="/agents" className="text-[12px] text-white/45 hover:text-white/80">
          Agents
        </Link>
        <span className="text-white/25">/</span>
        <span className="text-[13px] font-medium text-white/85">Agent teams</span>
      </div>

      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-5 px-6 py-8">
        <p className="text-[13px] text-white/50">
          Group the agents you want to work together, then attach the group to a room or a chat. Inside
          it they know each other and hand work to one another, and nobody outside the group gets pulled in.
        </p>

        {error && (
          <div role="alert" className="rounded-xl border border-amber-300/25 bg-amber-300/[0.06] px-4 py-2.5 text-[12px] text-amber-200/90">
            {error}
          </div>
        )}

        <section className="rounded-2xl border border-line bg-white/[0.03] p-5">
          <div className="mb-3 text-[13px] font-medium text-white/80">New team</div>
          <input
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sales desk"
            aria-label="New team name"
            className="mb-3 w-full rounded-lg border border-line bg-transparent px-3 py-2 text-[13px] text-white/85 outline-none focus:border-white/25"
          />
          <AgentChips
            selected={picked}
            onToggle={(t) => setPicked((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))}
          />
          <button
            type="button"
            disabled={!name.trim() || picked.length === 0 || creating}
            onClick={() => void create()}
            className="mt-4 rounded-full bg-[#b7cba6] px-4 py-1.5 text-[12px] font-medium text-black transition-transform duration-150 ease-out active:scale-[0.97] disabled:opacity-40"
          >
            {creating ? 'Creating…' : 'Create team'}
          </button>
        </section>

        {teams === null ? (
          <div className="text-[12px] text-white/35">Loading…</div>
        ) : teams.length === 0 ? (
          <div className="text-[12px] text-white/35">No teams yet. Your first one will show up here.</div>
        ) : (
          teams.map((t) => (
            <TeamCard
              key={t.id}
              team={t}
              allTeams={teams}
              options={options}
              onChange={(next) => setTeams((cur) => (cur ?? []).map((x) => (x.id === next.id ? next : x)))}
              onDeleted={(id) => setTeams((cur) => (cur ?? []).filter((x) => x.id !== id))}
              onError={setError}
            />
          ))
        )}
      </div>
    </div>
  )
}
