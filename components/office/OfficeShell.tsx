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
 *
 * Below MIN_WIDTH the grid auto-collapses both side panels to stubs instead
 * of refusing to render: three columns squeezed into too little space produce
 * an unreadable sliver of chat, but locking the user out on an ordinary
 * laptop (viewport minus the global nav sidebar) is worse. Collapsing hands
 * the freed space straight to the `1fr` chat column, so MissionControl stays
 * visible with the sidebar open. Manual expand is honored again once wider.
 */
import { cloneElement, isValidElement } from "react"
import { useAgentColumnCollapse } from "@/hooks/useAgentColumnCollapse"
import { useRailCollapse } from "@/hooks/useRailCollapse"
import { useMinWidth } from "@/hooks/useMinWidth"

const STUB_WIDTH = "56px"
const AGENT_COL_TRACK = "minmax(220px, 18%)"
const RAIL_TRACK = "minmax(280px, 20%)"
const MIN_WIDTH = 1100

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
  const { ref, tooNarrow } = useMinWidth<HTMLDivElement>(MIN_WIDTH)

  // Narrow office: force both side panels to stubs so the conversation keeps
  // the room. Manual collapse state is untouched and applies again once wide.
  const agentCollapsed = agentCol.collapsed || tooNarrow
  const railCollapsed = railCol.collapsed || tooNarrow

  const gridTemplateColumns = [
    agentCollapsed ? STUB_WIDTH : AGENT_COL_TRACK,
    "1fr",
    railCollapsed ? STUB_WIDTH : RAIL_TRACK,
  ].join(" ")

  return (
    <div ref={ref} className="grid h-full w-full min-w-0 overflow-hidden bg-surface-1" style={{ gridTemplateColumns }}>
      <div className="min-h-0 min-w-0">
        {isValidElement(agentColumn)
          ? cloneElement(agentColumn, { collapsed: agentCollapsed, onToggleCollapse: agentCol.toggle })
          : agentColumn}
      </div>
      <div className="flex min-h-0 min-w-0 flex-col">{children}</div>
      <div className="min-h-0 min-w-0">
        {isValidElement(rail)
          ? cloneElement(rail, { collapsed: railCollapsed, onToggleCollapse: railCol.toggle })
          : rail}
      </div>
    </div>
  )
}
