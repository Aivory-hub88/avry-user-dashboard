import { Bot, Terminal } from "lucide-react"
import { useMode } from "@/contexts/ModeContext"
import { PREBUILT_AGENTS } from "@/lib/agentChat"

interface ConsoleTopBarProps {
  onNewChat: () => void
}

// Switching agents happens in the left column now — this just confirms
// who you're talking to, rather than duplicating that control here too.
export default function ConsoleTopBar({ onNewChat }: ConsoleTopBarProps) {
  const { agentTarget } = useMode()
  const activeAgent = PREBUILT_AGENTS.find((a) => a.type === agentTarget)

  return (
    <div className="flex h-12 shrink-0 items-center justify-between border-b border-line bg-surface-1 px-6 sticky top-0 z-10">
      <div className="flex items-center gap-2 text-[13px] font-medium text-white/80">
        {activeAgent ? <Bot className="w-3.5 h-3.5 text-accent" /> : <Terminal className="w-3.5 h-3.5 text-accent" />}
        {activeAgent ? activeAgent.title : "Aivory Console"}
        {agentTarget && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-accent-dim text-accent border border-accent/20 uppercase tracking-wider">
            Agent
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
