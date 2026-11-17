import { Bot, Plus, Terminal } from "lucide-react"
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
        className="flex shrink-0 items-center gap-1.5 rounded-full border border-dashed border-white/25 px-3 py-1 text-[11px] font-medium text-white/70 transition-all duration-200 hover:border-solid hover:border-white/40 hover:bg-white/[0.06] hover:text-white active:scale-95"
      >
        <Plus size={12} strokeWidth={2.5} />
        Create group
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
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-all duration-200 active:scale-95 ${
                on
                  ? "border-white bg-white text-black shadow-[0_0_0_3px_rgba(255,255,255,0.08)]"
                  : "border-white/10 bg-white/[0.03] text-white/60 hover:border-white/20 hover:bg-white/[0.06] hover:text-white/90"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${on ? "bg-black/60" : "bg-white/25"}`} />
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
          <span className="relative ml-2 grid grid-cols-2 items-center rounded-full border border-white/10 bg-black/30 p-[3px] shadow-inner" role="tablist" aria-label="Chat mode">
            <span
              aria-hidden
              className="absolute inset-y-[3px] left-[3px] w-[calc(50%-3px)] rounded-full bg-white shadow-[0_1px_6px_rgba(0,0,0,0.45)] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
              style={{ transform: chatMode === "room" ? "translateX(100%)" : "translateX(0)" }}
            />
            {(["direct", "room"] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={chatMode === m}
                onClick={() => onChatModeChange(m)}
                title={m === "room" ? "Mission Control chat room — @mention deployed agents" : "Direct chat"}
                className={`relative z-10 whitespace-nowrap rounded-full px-3.5 py-1 text-center text-[11px] font-semibold transition-colors duration-200 ${
                  chatMode === m ? "text-black" : "text-white/50 hover:text-white/85"
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
