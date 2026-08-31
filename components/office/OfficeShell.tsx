"use client"
/**
 * The three-column frame around Console: agents | conversation | agent panel.
 * Owns nothing about chat — `children` is the existing Console page, untouched.
 *
 * A real CSS Grid, not flex-with-fixed-widths: the agent column and the
 * rail each hold a fixed *proportion* of the screen (clamped so they never
 * get absurdly narrow or wide), and the chat column is `1fr` — it always
 * takes whatever's left. That's what makes collapsing either side panel a
 * push, never an overlay: shrinking a grid track to 56px hands the freed
 * space straight to the `1fr` column, there's no absolute positioning to
 * accidentally cover it. Same idea Grok Bot's three-pane layout uses.
 *
 * Collapse state for both side panels lives here (one grid, one owner of
 * the track sizes) and is injected into the pre-built `agentColumn`/`rail`
 * elements via cloneElement, rather than each panel silently deciding its
 * own pixel width the way flex children could get away with.
 */
import { cloneElement, isValidElement } from "react"
import { useAgentColumnCollapse } from "@/hooks/useAgentColumnCollapse"
import { useRailCollapse } from "@/hooks/useRailCollapse"

const STUB_WIDTH = "56px"
const AGENT_COL_TRACK = "minmax(220px, 18%)"
const RAIL_TRACK = "minmax(280px, 20%)"

export default function OfficeShell({
  agentColumn,
  rail,
  children,
}: {
  agentColumn: React.ReactElement<{ collapsed?: boolean; onToggleCollapse?: () => void }>
  rail: React.ReactElement<{ collapsed?: boolean; onToggleCollapse?: () => void }>
  children: React.ReactNode
}) {
  const agentCol = useAgentColumnCollapse()
  const railCol = useRailCollapse()

  const gridTemplateColumns = [
    agentCol.collapsed ? STUB_WIDTH : AGENT_COL_TRACK,
    "1fr",
    railCol.collapsed ? STUB_WIDTH : RAIL_TRACK,
  ].join(" ")

  return (
    <div className="grid h-full w-full min-w-0 overflow-hidden bg-[#353531]" style={{ gridTemplateColumns }}>
      <div className="min-h-0 min-w-0">
        {isValidElement(agentColumn)
          ? cloneElement(agentColumn, { collapsed: agentCol.collapsed, onToggleCollapse: agentCol.toggle })
          : agentColumn}
      </div>
      <div className="flex min-h-0 min-w-0 flex-col">{children}</div>
      <div className="min-h-0 min-w-0">
        {isValidElement(rail)
          ? cloneElement(rail, { collapsed: railCol.collapsed, onToggleCollapse: railCol.toggle })
          : rail}
      </div>
    </div>
  )
}
