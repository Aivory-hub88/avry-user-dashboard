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

/**
 * Room groups, no dropdown: one button to create a group, and your existing
 * groups as chips (click to use one, click again to go back to all agents).
 */
function GroupBar({
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
  return (
    <div className="ml-1 flex min-w-0 items-center gap-1.5">
      <button
        type="button"
        onClick={onNewGroup}
        className="shrink-0 rounded-full border border-[#b7cba6]/40 bg-[#b7cba6]/10 px-3 py-[3px] text-[11px] font-medium text-[#b7cba6] transition-colors hover:bg-[#b7cba6]/20"
      >
        + Create group of agents
      </button>
      {teams.map((t) => {
        const on = t.id === teamId
        return (
          <span key={t.id} className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              aria-pressed={on}
              onClick={() => onTeamChange(on ? null : t.id)}
              title={on ? "Back to all agents" : `Use ${t.name} in this room`}
              className={`rounded-full border px-3 py-[3px] text-[11px] font-medium transition-colors ${
                on ? "border-white bg-white text-black" : "border-white/10 bg-white/[0.04] text-white/60 hover:text-white/90"
              }`}
            >
              {t.name}
            </button>
            {on && onEditGroup && (
              <button
                type="button"
                onClick={onEditGroup}
                aria-label="Group info"
                className="rounded-full px-2 py-[3px] text-[11px] text-white/45 hover:bg-white/[0.06] hover:text-white/85"
              >
                Info
              </button>
            )}
          </span>
        )
      })}
    </div>
  )
}

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
          <GroupBar teams={teams} teamId={teamId} onTeamChange={onTeamChange} onNewGroup={onNewGroup} onEditGroup={onEditGroup} />
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
