import { Bot, Terminal } from "lucide-react"
import { useMode } from "@/contexts/ModeContext"
import { PREBUILT_AGENTS } from "@/lib/agentChat"

export type ConsoleChatMode = "direct" | "room"

interface ConsoleTopBarProps {
  onNewChat: () => void
  /** Room toggle — hidden unless the caller wires room mode (console page). */
  chatMode?: ConsoleChatMode
  onChatModeChange?: (mode: ConsoleChatMode) => void
  /** Deployed-agent count shown on the Room pill. */
  roomCount?: number
}

// Switching agents happens in the left column now — this just confirms
// who you're talking to, rather than duplicating that control here too.
// The Direct/Room switch turns the same composer into a Mission Control
// chat room: @mention deployed agents, every mention answers in parallel.
export default function ConsoleTopBar({ onNewChat, chatMode, onChatModeChange, roomCount = 0 }: ConsoleTopBarProps) {
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
