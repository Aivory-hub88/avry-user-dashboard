"use client"

import { useState, useRef, useEffect } from "react"

type ToolType = "attach-context" | "execution-log" | "upload-file"
type ModeType = "console" | "blueprint-mode" | "diagnostics" | "workflow-mode"

interface ContextToolbarProps {
  onToolSelect: (tool: ToolType | ModeType) => void
}

// Static toolbar buttons (non-mode)
const TOOL_CONFIG: { id: ToolType; label: string; icon: string }[] = [
  { id: "attach-context", label: "Attach Context", icon: "paperclip" },
  { id: "execution-log", label: "Execution Log", icon: "list" },
  { id: "upload-file", label: "Upload File", icon: "upload" },
]

// Mode switcher options
const MODE_CONFIG: { id: ModeType; label: string; icon: string }[] = [
  { id: "console", label: "Console", icon: "terminal" },
  { id: "blueprint-mode", label: "Blueprint Mode", icon: "layout" },
  { id: "diagnostics", label: "Diagnostics", icon: "activity" },
  { id: "workflow-mode", label: "Workflow Mode", icon: "git-branch" },
]

export default function ContextToolbar({ onToolSelect }: ContextToolbarProps) {
  const [hoveredTool, setHoveredTool] = useState<ToolType | null>(null)
  const [activeMode, setActiveMode] = useState<ModeType>("console")
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [dropdownOpen])

  const currentMode = MODE_CONFIG.find((m) => m.id === activeMode)!

  const handleModeSelect = (mode: ModeType) => {
    setActiveMode(mode)
    setDropdownOpen(false)
    onToolSelect(mode)
  }

  return (
    <div className="flex items-center gap-1 px-3 pb-2">
      {/* Static toolbar buttons */}
      {TOOL_CONFIG.map((tool) => {
        const isHovered = hoveredTool === tool.id
        return (
          <button
            key={tool.id}
            onClick={() => onToolSelect(tool.id)}
            onMouseEnter={() => setHoveredTool(tool.id)}
            onMouseLeave={() => setHoveredTool(null)}
            className={`
              flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all
              ${isHovered
                ? "bg-white/10 text-white"
                : "bg-white/5 text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.08]"
              }
            `}
            aria-label={tool.label}
            title={tool.label}
          >
            {getIcon(tool.icon)}
            <span>{tool.label}</span>
          </button>
        )
      })}

      {/* Mode switcher dropdown */}
      <div className="relative" ref={dropdownRef}>
        {/* Trigger button */}
        <button
          onClick={() => setDropdownOpen((o) => !o)}
          className={`
            flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all
            ${dropdownOpen
              ? "bg-white/10 text-white"
              : "bg-white/5 text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.08]"
            }
          `}
          aria-haspopup="listbox"
          aria-expanded={dropdownOpen}
          aria-label={`Mode: ${currentMode.label}`}
        >
          {getIcon(currentMode.icon)}
          <span>{currentMode.label}</span>
          {/* Chevron up/down */}
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform duration-150 ${dropdownOpen ? "rotate-180" : ""}`}
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {/* Dropdown menu — opens upward */}
        {dropdownOpen && (
          <div
            className="absolute bottom-full left-0 mb-1.5 w-48 rounded-lg border border-white/10 bg-[#2d2d2a] shadow-xl z-50 overflow-hidden"
            role="listbox"
            aria-label="Select mode"
          >
            {MODE_CONFIG.map((mode) => {
              const isActive = mode.id === activeMode
              return (
                <button
                  key={mode.id}
                  role="option"
                  aria-selected={isActive}
                  onClick={() => handleModeSelect(mode.id)}
                  className={`
                    w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-medium text-left transition-colors
                    ${isActive
                      ? "text-white bg-white/[0.06]"
                      : "text-zinc-400 hover:text-white hover:bg-white/[0.06]"
                    }
                  `}
                >
                  {getIcon(mode.icon)}
                  <span className="flex-1">{mode.label}</span>
                  {/* Checkmark for active mode */}
                  {isActive && (
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-[#2dd4a0] shrink-0"
                      aria-hidden="true"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function getIcon(name: string) {
  const icons: Record<string, React.ReactElement> = {
    paperclip: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
      </svg>
    ),
    list: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="8" y1="6" x2="21" y2="6"/>
        <line x1="8" y1="12" x2="21" y2="12"/>
        <line x1="8" y1="18" x2="21" y2="18"/>
        <line x1="3" y1="6" x2="3.01" y2="6"/>
        <line x1="3" y1="12" x2="3.01" y2="12"/>
        <line x1="3" y1="18" x2="3.01" y2="18"/>
      </svg>
    ),
    upload: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="17 8 12 3 7 8"/>
        <line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
    ),
    terminal: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="4 17 10 11 4 5"/>
        <line x1="12" y1="19" x2="20" y2="19"/>
      </svg>
    ),
    layout: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
        <line x1="3" y1="9" x2="21" y2="9"/>
        <line x1="9" y1="21" x2="9" y2="9"/>
      </svg>
    ),
    activity: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
    ),
    "git-branch": (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="6" y1="3" x2="6" y2="15"/>
        <circle cx="18" cy="6" r="3"/>
        <circle cx="6" cy="18" r="3"/>
        <path d="M18 9a9 9 0 0 1-9 9"/>
      </svg>
    ),
  }
  return icons[name] || null
}
