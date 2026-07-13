"use client"
/**
 * Console "who are you talking to" picker — replaces the old mode dropdown.
 * Aivory Console (default zeroclaw brain) or one of the prebuilt deployable
 * agents; deployed agents show their live channels, Enterprise-gated agents
 * show a lock (the server still enforces the gate on send).
 */
import { useEffect, useRef, useState } from "react"
import { Terminal, Bot, ChevronDown, Check, Lock } from "lucide-react"
import { useClickOutside } from "@/hooks/useClickOutside"
import { useMode } from "@/contexts/ModeContext"
import { PREBUILT_AGENTS, listDeployments, AgentDeployment } from "@/lib/agentChat"

export default function AgentSelector() {
  const [open, setOpen] = useState(false)
  const { agentTarget, setAgentTarget } = useMode()
  const [deployments, setDeployments] = useState<AgentDeployment[]>([])
  const fetchedRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useClickOutside(containerRef, () => setOpen(false))

  // Deployment badges are decorative — fetch once, on first open
  useEffect(() => {
    if (!open || fetchedRef.current) return
    fetchedRef.current = true
    listDeployments().then(setDeployments).catch(() => {})
  }, [open])

  const activeAgent = PREBUILT_AGENTS.find((a) => a.type === agentTarget)
  const channelsFor = (type: string) =>
    [...new Set(deployments.filter((d) => d.agentType === type).map((d) => d.kind))]

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 bg-white/5 hover:bg-white/[0.08] border border-white/[0.07] rounded-lg px-3 py-1.5 text-sm font-medium text-white/80 transition-colors"
      >
        {activeAgent ? (
          <Bot className="w-3.5 h-3.5 text-accent" />
        ) : (
          <Terminal className="w-3.5 h-3.5 text-accent" />
        )}
        {activeAgent ? activeAgent.title : "Aivory Console"}
        <ChevronDown
          className="w-3 h-3 text-white/30 transition-transform duration-150"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        />
      </button>

      {open && (
        <div className="absolute top-full mt-1.5 left-0 z-50 min-w-[290px] bg-[#1E1E1B] border border-white/[0.08] rounded-lg py-1 shadow-xl">
          <button
            onClick={() => { setAgentTarget(null); setOpen(false) }}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs transition-colors ${
              !agentTarget ? "text-accent bg-accent-dim" : "text-white/60 hover:text-white/90 hover:bg-white/[0.06]"
            }`}
          >
            <Terminal className="w-3.5 h-3.5 shrink-0" />
            Aivory Console
            {!agentTarget && <Check className="w-3 h-3 ml-auto" />}
          </button>

          <div className="flex items-center gap-2 px-3 pt-2 pb-1">
            <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/30">
              Your Agents
            </span>
            <div className="flex-1 h-px bg-white/[0.06]" />
          </div>

          {PREBUILT_AGENTS.map((agent) => {
            const isSelected = agent.type === agentTarget
            const channels = channelsFor(agent.type)
            return (
              <button
                key={agent.type}
                onClick={() => { setAgentTarget(agent.type); setOpen(false) }}
                className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs transition-colors ${
                  isSelected ? "text-accent bg-accent-dim" : "text-white/60 hover:text-white/90 hover:bg-white/[0.06]"
                }`}
              >
                <Bot className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{agent.title}</span>
                {agent.enterprise && (
                  <span className="inline-flex items-center gap-0.5 text-[8px] font-semibold uppercase tracking-wider text-[#e8b96a]/90">
                    <Lock className="w-2.5 h-2.5" />
                  </span>
                )}
                <span className="ml-auto flex items-center gap-1 whitespace-nowrap">
                  {channels.length > 0 ? (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-[#b7cba6]" />
                      <span className="text-[9px] text-white/40 uppercase tracking-wider">
                        {channels.join(" · ")}
                      </span>
                    </>
                  ) : (
                    <span className="text-[9px] text-white/25">not deployed</span>
                  )}
                  {isSelected && <Check className="w-3 h-3" />}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
