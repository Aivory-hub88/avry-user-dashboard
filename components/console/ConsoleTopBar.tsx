import ModeSelector from "@/components/header/ModeSelector"
import { useMode } from "@/contexts/ModeContext"

interface ConsoleTopBarProps {
  onNewChat: () => void
}

export default function ConsoleTopBar({ onNewChat }: ConsoleTopBarProps) {
  const { activeMode } = useMode()

  return (
    <div className="flex items-center justify-between px-6 py-3 border-b border-white/5 bg-[#353531] backdrop-blur sticky top-0 z-10 h-12">
      <div className="flex items-center gap-3">
        <ModeSelector />
        {activeMode !== 'Console' && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-accent-dim text-accent border border-accent/20 uppercase tracking-wider">
            {activeMode}
          </span>
        )}
      </div>
      <div className="flex items-center">
        <button
          className="px-4 py-2 text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors border border-zinc-700 hover:border-zinc-600"
          onClick={onNewChat}
          title="Start a new conversation"
        >
          New chat
        </button>
      </div>
    </div>
  )
}
