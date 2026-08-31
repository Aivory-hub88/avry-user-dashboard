"use client"
/**
 * The three-column frame around Console: agents | conversation | agent panel.
 * Owns nothing about chat — `children` is the existing Console page, untouched.
 *
 * The rail's push-vs-float breakpoint (Phase 4) is decided here via
 * useRailMode and handed down as a prop — AgentRail itself does the actual
 * float-vs-flow rendering, since only it knows whether it's open or
 * collapsed at any given moment.
 */
import { cloneElement, isValidElement } from "react"
import { useRailMode } from "@/hooks/useRailMode"

interface OfficeShellProps {
  agentColumn: React.ReactNode
  rail: React.ReactElement<{ mode?: "dock" | "float" }>
  children: React.ReactNode
}

export default function OfficeShell({ agentColumn, rail, children }: OfficeShellProps) {
  const { ref, mode } = useRailMode()

  return (
    <div ref={ref} className="relative flex h-full w-full min-w-0 overflow-hidden bg-[#353531]">
      {agentColumn}
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      {isValidElement(rail) ? cloneElement(rail, { mode }) : rail}
    </div>
  )
}
