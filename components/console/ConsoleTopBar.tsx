import { useEffect, useRef, useState } from "react"
import { Bot, Terminal } from "lucide-react"
import { useMode } from "@/contexts/ModeContext"
import { PREBUILT_AGENTS } from "@/lib/agentChat"
import type { AgentTeam } from "@/lib/agentTeams"

export type ConsoleChatMode = "direct" | "room"

interface ConsoleTopBarProps {
  onNewChat: () => void
  /** Room toggle — hidden unless the caller wires room mode (console page). */
  chatMode?: ConsoleChatMode
  onChatModeChange?: (mode: ConsoleChatMode) => void
  /** Deployed-agent count shown on the Room pill. */
  roomCount?: number
  /** Agent Teams (ADR-020): scope the Room to one team's agents. Hidden with no teams. */
  teams?: AgentTeam[]
  teamId?: string | null
  onTeamChange?: (id: string | null) => void
  /** Open the "New group" flow (WhatsApp-style: pick agents, name it). */
  onNewGroup?: () => void
  /** Open "Group info" for the selected group. */
  onEditGroup?: () => void
}

/** Room group switcher: All agents / your groups / "New group". */
function GroupMenu({
  teams,
  teamId,
  onTeamChange,
  onNewGroup,
  onEditGroup,
}: {
  teams: AgentTeam[]
  teamId: string | null
  onTeamChange: (id: string | null) => void
  onNewGroup: () => void
  onEditGroup?: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = teams.find((t) => t.id === teamId) ?? null

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const item = "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[12px] hover:bg-white/[0.06]"

  return (
    <div ref={ref} className="relative ml-1 flex items-center gap-1">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title="Choose which agents this room uses"
        className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-[3px] text-[11px] font-medium text-white/70 transition-colors hover:text-white/90"
      >
        {current ? current.name : "All agents"} <span aria-hidden="true" className="text-white/35">▾</span>
      </button>
      {current && onEditGroup && (
        <button
          type="button"
          onClick={onEditGroup}
          title="Group info"
          aria-label="Group info"
          className="rounded-full px-2 py-[3px] text-[11px] text-white/45 hover:bg-white/[0.06] hover:text-white/85"
        >
          Info
        </button>
      )}
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-30 mt-2 min-w-[220px] overflow-hidden rounded-xl border border-white/10 bg-[#161618] py-1 shadow-2xl"
        >
          <button
            role="menuitemradio"
            aria-checked={!current}
            className={`${item} ${!current ? "text-white" : "text-white/70"}`}
            onClick={() => {
              onTeamChange(null)
              setOpen(false)
            }}
          >
            All agents {!current && <span aria-hidden="true">✓</span>}
          </button>
          {teams.map((t) => (
            <button
              key={t.id}
              role="menuitemradio"
              aria-checked={t.id === teamId}
              className={`${item} ${t.id === teamId ? "text-white" : "text-white/70"}`}
              onClick={() => {
                onTeamChange(t.id)
                setOpen(false)
              }}
            >
              <span className="truncate">{t.name}</span>
              <span className="shrink-0 text-white/35">{t.agent_types.length} {t.id === teamId ? "✓" : ""}</span>
            </button>
          ))}
          <div className="my-1 border-t border-white/[0.06]" />
          <button
            role="menuitem"
            className={`${item} text-[#b7cba6]`}
            onClick={() => {
              setOpen(false)
              onNewGroup()
            }}
          >
            + New group
          </button>
        </div>
      )}
    </div>
  )
}

// Switching agents happens in the left column now — this just confirms
// who you're talking to, rather than duplicating that control here too.
// The Direct/Room switch turns the same composer into a Mission Control
// chat room: @mention deployed agents, every mention answers in parallel.
export default function ConsoleTopBar({ onNewChat, chatMode, onChatModeChange, roomCount = 0, teams = [], teamId = null, onTeamChange, onNewGroup, onEditGroup }: ConsoleTopBarProps) {
  const { agentTarget } = useMode()
  const activeAgent = PREBUILT_AGENTS.find((a) => a.type === agentTarget)
  const inRoom = chatMode === "room"

  return (
    <div className="flex h-12 shrink-0 items-center justify-between border-b border-transparent bg-surface-1/70 px-6 sticky top-0 z-10 backdrop-blur-xl">
      <div className="flex items-center gap-2 text-[13px] font-medium text-white/80">
        {inRoom ? (
          <span className="text-[13px] font-medium text-white/80">Mission Control Room</span>
        ) : (
          <>
            {activeAgent ? <Bot className="w-3.5 h-3.5 text-accent" /> : <Terminal className="w-3.5 h-3.5 text-accent" />}
            {activeAgent ? activeAgent.name : "Aivory Console"}
          </>
        )}
        {agentTarget && !inRoom && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-accent-dim text-accent border border-accent/20 uppercase tracking-wider">
            Agent
          </span>
        )}
        {onChatModeChange && (
          <span className="ml-2 flex items-center rounded-full border border-white/10 bg-white/[0.04] p-[3px]" role="tablist" aria-label="Chat mode">
            {(["direct", "room"] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={chatMode === m}
                onClick={() => onChatModeChange(m)}
                title={m === "room" ? "Mission Control chat room — @mention deployed agents" : "Direct chat"}
                className={`rounded-full px-3 py-[3px] text-[11px] font-medium transition-colors ${
                  chatMode === m ? "bg-white text-black" : "text-white/50 hover:text-white/85"
                }`}
              >
                {m === "direct" ? "Direct" : `Room${roomCount > 0 ? ` · ${roomCount}` : ""}`}
              </button>
            ))}
          </span>
        )}
        {inRoom && onTeamChange && onNewGroup && (
          <GroupMenu teams={teams} teamId={teamId} onTeamChange={onTeamChange} onNewGroup={onNewGroup} onEditGroup={onEditGroup} />
        )}
      </div>
      <div className="flex items-center">
        <button
          className="console-pill !py-2"
          onClick={onNewChat}
          title="Start a new conversation"
        >
          New chat
        </button>
      </div>
    </div>
  )
}
