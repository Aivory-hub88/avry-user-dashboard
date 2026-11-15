"use client"

/**
 * "New room" for team owners: name, team, optional goal, due date and agents.
 * Opens the room right away (POST /api/workspace/rooms files and approves the
 * request in one step) and goes straight into it. Editors keep the request
 * flow, since an owner has to approve their work.
 */
import { useEffect, useRef, useState } from "react"
import { X } from "lucide-react"
import { AgentAvatar } from "@/components/office/AgentAvatar"
import { Button, fieldClass } from "@/components/requests/requestUi"
import { AGENT_ROSTER } from "@/lib/agentRoster"
import { LIMITS } from "@/lib/projectRequests"
import { roomsApi, type TeamSummary } from "@/lib/requestsClient"

export default function NewRoomDialog({ teams, onClose, onOpened }: { teams: TeamSummary[]; onClose: () => void; onOpened: (roomId: string) => void }) {
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "")
  const [title, setTitle] = useState("")
  const [goal, setGoal] = useState("")
  const [deadline, setDeadline] = useState("")
  const [agents, setAgents] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    titleRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [busy, onClose])

  const submit = async () => {
    if (busy) return
    if (title.trim().length < 2) {
      setError("Give the room a name first.")
      titleRef.current?.focus()
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { roomId } = await roomsApi.create({ workspaceId: teamId, title: title.trim(), goal: goal.trim(), deadline: deadline || null, agents })
      onOpened(roomId)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="new-room-title">
      <div className="absolute inset-0" onClick={() => !busy && onClose()} aria-hidden />
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
        className="relative max-h-[90vh] w-full max-w-[520px] overflow-y-auto rounded-3xl border border-white/[0.08] bg-[#151517] p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div id="new-room-title" className="text-[17px] font-semibold text-white">New room</div>
            <div className="mt-1 text-[12.5px] leading-relaxed text-white/50">A room for one project: chat, tasks and notes with your team and its agents. It opens right away.</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-white/40 hover:bg-white/[0.06] hover:text-white/80">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-[12px] text-white/60">Name</span>
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                setError(null)
              }}
              placeholder="Website relaunch"
              maxLength={LIMITS.title}
              className={`w-full ${fieldClass}`}
            />
          </label>
          {teams.length > 1 && (
            <label className="block">
              <span className="mb-1.5 block text-[12px] text-white/60">Team</span>
              <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className={`w-full ${fieldClass}`}>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block">
            <span className="mb-1.5 block text-[12px] text-white/60">
              Goal <span className="text-white/30">optional</span>
            </span>
            <textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={3} placeholder="What should be done, and by when?" className={`w-full resize-none ${fieldClass}`} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] text-white/60">
              Due date <span className="text-white/30">optional</span>
            </span>
            <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={`w-[180px] ${fieldClass} [color-scheme:dark]`} />
          </label>
          <div>
            <span className="mb-1.5 block text-[12px] text-white/60">
              Agents <span className="text-white/30">optional</span>
            </span>
            <div className="flex flex-wrap gap-2">
              {AGENT_ROSTER.map((a) => {
                const on = agents.includes(a.type)
                return (
                  <button
                    key={a.type}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setAgents((cur) => (on ? cur.filter((x) => x !== a.type) : [...cur, a.type].slice(0, LIMITS.agents)))}
                    className={`flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-[12px] transition-[transform,background-color,border-color,color] duration-150 ease-out active:scale-[0.97] ${
                      on ? "border-white/25 bg-white/[0.08] text-white/85" : "border-line text-white/45 hover:text-white/70"
                    }`}
                  >
                    <AgentAvatar type={a.type} size={20} />
                    <span>{a.name}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {error && <div className="mt-4 rounded-xl bg-amber-500/10 px-3.5 py-2.5 text-[12px] text-amber-200">{error}</div>}

        <div className="mt-6 flex items-center justify-end gap-2">
          <Button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button tone="primary" type="submit" disabled={busy}>
            {busy ? "Opening…" : "Open room"}
          </Button>
        </div>
      </form>
    </div>
  )
}
