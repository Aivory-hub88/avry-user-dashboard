"use client"

/**
 * Room side panel (ADR-019 P2): what the room is about and who's in it.
 * Brief (from the approved request), people and agents with live status,
 * the room's files on R2, and a way into the task board seeded from the
 * request's table. Text sits in span/div only (global `main p` rules).
 */
import Link from "next/link"
import { useState } from "react"
import { AgentAvatar } from "@/components/office/AgentAvatar"
import FileAttachments from "@/components/requests/FileAttachments"
import { formatDate } from "@/components/requests/requestUi"
import type { SpaceAgentTask } from "@/lib/spaceAgent"
import type { RoomAgent } from "@/lib/roomChat"

export interface RoomBrief {
  goal?: string
  deadline?: string | null
  priority?: string
  fields?: { label: string; value: string }[]
}

export type Autonomy = "observe" | "suggest" | "act"

const AUTONOMY: { value: Autonomy; label: string; hint: string }[] = [
  { value: "observe", label: "Only when asked", hint: "Agents answer when someone mentions them." },
  { value: "suggest", label: "Suggest", hint: "Agents also post a kickoff and file summaries on their own, and propose changes instead of making them." },
  { value: "act", label: "Act", hint: "Agents may also use their tools unprompted. Risky actions still wait for your approval." },
]

export interface RoomPerson {
  id: string
  name: string
  role: string
}

const PRIORITY_LABEL: Record<string, string> = { Low: "Low", Med: "Medium", High: "High" }

function agentStatus(type: string, tasks: SpaceAgentTask[]): { label: string; tone: string } {
  const mine = tasks.filter((t) => t.agentType === type)
  if (mine.some((t) => t.status === "blocked")) return { label: "Needs approval", tone: "text-[#FFB454]" }
  if (mine.some((t) => t.status === "todo" || t.status === "in_progress")) return { label: "Working", tone: "text-[#b7cba6]" }
  return { label: "Idle", tone: "text-white/30" }
}

function Block({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="border-b border-line px-5 py-4 last:border-b-0">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-white/35">{title}</span>
        {action}
      </div>
      {children}
    </div>
  )
}

export default function RoomPanel({
  roomId,
  brief,
  requestId,
  people,
  agents,
  tasks,
  canWrite,
  filesReloadKey,
  autonomy = "suggest",
  onAutonomyChange,
}: {
  roomId: string
  brief: RoomBrief | null
  requestId: string | null
  people: RoomPerson[]
  agents: RoomAgent[]
  tasks: SpaceAgentTask[]
  canWrite: boolean
  filesReloadKey: number
  autonomy?: Autonomy
  /** Present for the room owner only; others see the setting read-only. */
  onAutonomyChange?: (next: Autonomy) => void
}) {
  const [goalOpen, setGoalOpen] = useState(false)
  const goal = brief?.goal?.trim() ?? ""
  const longGoal = goal.length > 220

  return (
    <aside className="flex w-[320px] shrink-0 flex-col overflow-y-auto border-l border-line bg-black/10" aria-label="Room details">
      <Block
        title="Brief"
        action={
          requestId ? (
            <Link href={`/workspace/requests/${requestId}`} className="text-[11px] text-white/40 hover:text-white/75">
              View request
            </Link>
          ) : null
        }
      >
        {goal ? (
          <div className="text-[13px] leading-relaxed text-white/75">
            <span className="whitespace-pre-wrap">{longGoal && !goalOpen ? `${goal.slice(0, 220)}…` : goal}</span>
            {longGoal && (
              <button type="button" onClick={() => setGoalOpen((v) => !v)} className="ml-1 text-[12px] text-white/40 hover:text-white/70">
                {goalOpen ? "Less" : "More"}
              </button>
            )}
          </div>
        ) : (
          <div className="text-[12px] text-white/30">No brief for this room.</div>
        )}
        {(brief?.deadline || brief?.priority || (brief?.fields?.length ?? 0) > 0) && (
          <div className="mt-3 space-y-1.5 text-[12px]">
            {brief?.deadline && (
              <div className="flex justify-between gap-3">
                <span className="text-white/35">Deadline</span>
                <span className="text-white/70">{formatDate(brief.deadline)}</span>
              </div>
            )}
            {brief?.priority && (
              <div className="flex justify-between gap-3">
                <span className="text-white/35">Priority</span>
                <span className="text-white/70">{PRIORITY_LABEL[brief.priority] ?? brief.priority}</span>
              </div>
            )}
            {(brief?.fields ?? []).map((f, i) => (
              <div key={i} className="flex justify-between gap-3">
                <span className="shrink-0 text-white/35">{f.label}</span>
                <span className="truncate text-right text-white/70">{f.value}</span>
              </div>
            ))}
          </div>
        )}
      </Block>

      <Block title="Agents">
        {agents.length === 0 ? (
          <div className="text-[12px] text-white/30">No agents in this room yet.</div>
        ) : (
          <div className="space-y-2.5">
            {agents.map((a) => {
              const s = agentStatus(a.type, tasks)
              return (
                <div key={a.type} className="flex items-center gap-2.5">
                  <AgentAvatar type={a.type} size={26} />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-white/80">{a.name}</span>
                  <span className={`text-[11px] ${s.tone}`}>{s.label}</span>
                </div>
              )
            })}
            <div className="pt-1 text-[11px] text-white/30">Mention an agent with @ to give it work.</div>
          </div>
        )}
        <div className="mt-4">
          <div className="mb-1.5 text-[11px] text-white/35">Working on their own</div>
          {onAutonomyChange ? (
            <div className="flex items-center gap-0.5 rounded-full bg-white/[0.04] p-0.5" role="radiogroup" aria-label="How freely agents act on their own">
              {AUTONOMY.map((a) => (
                <button
                  key={a.value}
                  type="button"
                  role="radio"
                  aria-checked={autonomy === a.value}
                  onClick={() => autonomy !== a.value && onAutonomyChange(a.value)}
                  className={`flex-1 rounded-full px-2 py-1 text-[11px] transition-colors duration-150 ${
                    autonomy === a.value ? "bg-white text-black" : "text-white/45 hover:text-white/75"
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="text-[12px] text-white/65">{AUTONOMY.find((a) => a.value === autonomy)?.label}</div>
          )}
          <div className="mt-1.5 text-[11px] leading-relaxed text-white/30">{AUTONOMY.find((a) => a.value === autonomy)?.hint}</div>
        </div>
      </Block>

      <Block title="People">
        <div className="space-y-2">
          {people.map((p) => (
            <div key={p.id} className="flex items-center gap-2.5">
              <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[11px] font-medium text-white/65">
                {p.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-white/75">{p.name}</span>
              <span className="text-[11px] text-white/30">{p.role}</span>
            </div>
          ))}
        </div>
      </Block>

      <Block title="Files">
        <FileAttachments base={`/api/workspace/${roomId}/files`} canWrite={canWrite} reloadKey={filesReloadKey} />
      </Block>

    </aside>
  )
}
