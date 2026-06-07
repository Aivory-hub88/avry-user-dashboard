"use client"
import { useState, useRef } from "react"
import { Terminal, LayoutTemplate, Activity, GitBranch, ChevronDown, Check } from "lucide-react"
import { useClickOutside } from "@/hooks/useClickOutside"
import { useMode } from "@/contexts/ModeContext"

type Mode = 'Console' | 'Blueprint Mode' | 'Diagnostics' | 'Workflow Mode'

const MODES: Mode[] = ['Console', 'Blueprint Mode', 'Diagnostics', 'Workflow Mode']

const MODE_ICONS: Record<Mode, React.FC<{ className?: string }>> = {
  Console: Terminal,
  'Blueprint Mode': LayoutTemplate,
  Diagnostics: Activity,
  'Workflow Mode': GitBranch,
}

export default function ModeSelector() {
  const [open, setOpen] = useState(false)
  const { activeMode, setActiveMode } = useMode()
  const containerRef = useRef<HTMLDivElement>(null)

  useClickOutside(containerRef, () => setOpen(false))

  const ModeIcon = MODE_ICONS[activeMode]

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 bg-white/5 hover:bg-white/[0.08] border border-white/[0.07] rounded-lg px-3 py-1.5 text-sm font-medium text-white/80 transition-colors"
      >
        <ModeIcon className="w-3.5 h-3.5 text-accent" />
        {activeMode}
        <ChevronDown
          className="w-3 h-3 text-white/30 transition-transform duration-150"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>

      {open && (
        <div className="absolute top-full mt-1.5 left-0 z-50 min-w-[180px] bg-[#1E1E1B] border border-white/[0.08] rounded-lg py-1 shadow-xl">
          {MODES.map((mode) => {
            const Icon = MODE_ICONS[mode]
            const isSelected = mode === activeMode
            return (
              <button
                key={mode}
                onClick={() => {
                  setActiveMode(mode)
                  setOpen(false)
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs transition-colors ${
                  isSelected
                    ? 'text-accent bg-accent-dim'
                    : 'text-white/60 hover:text-white/90 hover:bg-white/[0.06]'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                {mode}
                {isSelected && <Check className="w-3 h-3 ml-auto" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
