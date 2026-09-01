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
 * Below MIN_WIDTH, the grid doesn't render at all — a fixed-ratio track
 * still degrades gracefully in the sense that nothing overlaps, but three
 * columns squeezed into too little space just produces an unreadable
 * sliver of chat. Refusing outright (this product is desktop-only by
 * design — see [user-dashboard-local-preview] memory) is more honest than
 * a degraded layout nobody asked for.
 */
import { cloneElement, isValidElement } from "react"
import { Monitor } from "lucide-react"
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

  if (tooNarrow) {
    return (
      <div ref={ref} className="grid h-full w-full place-items-center bg-[#353531] px-8 text-center">
        <div className="max-w-[320px]">
          <Monitor className="mx-auto mb-3 h-6 w-6 text-white/25" />
          {/* Not <p> — a global `main p` style overrides Tailwind's own
              font-size/color/margin on any plain paragraph tag here. */}
          <div className="mb-1.5 text-[14px] font-medium leading-tight text-white/70">Widen your window</div>
          <div className="text-[12.5px] font-light leading-[1.55] text-white/40">
            The working office needs more room to show your agents, the conversation, and
            their status side by side. It isn&apos;t built for narrower screens yet.
          </div>
        </div>
      </div>
    )
  }

  const gridTemplateColumns = [
    agentCol.collapsed ? STUB_WIDTH : AGENT_COL_TRACK,
    "1fr",
    railCol.collapsed ? STUB_WIDTH : RAIL_TRACK,
  ].join(" ")

  return (
    <div ref={ref} className="grid h-full w-full min-w-0 overflow-hidden bg-[#353531]" style={{ gridTemplateColumns }}>
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
