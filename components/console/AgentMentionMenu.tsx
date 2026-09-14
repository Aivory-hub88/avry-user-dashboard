"use client"
/**
 * Dropdown shown while typing @ in Room mode — one row per deployed agent,
 * like mentioning members in a group chat. Avatar + first name + role +
 * channel dots; keyboard navigable (↑/↓/Enter/Tab/Esc handled by the caller
 * via onKeyDown-first semantics).
 */

import { AgentAvatar } from "@/components/office/AgentAvatar"
import type { MentionCandidate } from "@/lib/agentMentions"

interface AgentMentionMenuProps {
  candidates: MentionCandidate[]
  activeIndex: number
  onSelect: (candidate: MentionCandidate) => void
  onHover: (index: number) => void
  /** Total deployeds before query filtering — distinguishes "nobody
   *  deployed" from "query matched nothing" (e.g. @all, which is a valid
   *  broadcast keyword, not an agent name). */
  totalCandidates: number
  /** Current @query, shown in the no-match hint. */
  query: string
}

const CHANNEL_DOT: Record<string, string> = {
  telegram: "bg-sky-400",
  slack: "bg-fuchsia-400",
  api: "bg-emerald-400",
}

export default function AgentMentionMenu({
  candidates,
  activeIndex,
  onSelect,
  onHover,
  totalCandidates,
  query,
}: AgentMentionMenuProps) {
  if (candidates.length === 0) {
    // Deliberately NOT offering a selectable "@all" row here: with an empty
    // filtered list, Enter falls through and sends the raw text, which the
    // parser expands to a broadcast. A selectable row would hijack Enter
    // into inserting a single agent instead — the exact trap to avoid.
    return (
      <div className="absolute bottom-full left-0 z-30 mb-2 w-[280px] rounded-2xl border border-white/10 bg-[#2b2b28] p-4 shadow-2xl">
        {totalCandidates > 0 ? (
          <>
            <div className="text-[13px] font-medium text-white/85">No match for &ldquo;@{query || ""}&rdquo;</div>
            <div className="mt-1 text-[12px] font-light leading-relaxed text-white/45">
              Press Enter to send anyway — @all, @everyone and @team mention everyone in the room.
            </div>
          </>
        ) : (
          <>
            <div className="text-[13px] font-medium text-white/85">No deployed agents yet</div>
            <div className="mt-1 text-[12px] font-light leading-relaxed text-white/45">
              Deploy an agent first — mentions only list agents that are actually running somewhere.
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div
      role="listbox"
      aria-label="Mention an agent"
      className="absolute bottom-full left-0 z-30 mb-2 max-h-[280px] w-[300px] overflow-y-auto rounded-2xl border border-white/10 bg-[#2b2b28] p-1.5 shadow-2xl [animation:dropIn_0.18s_cubic-bezier(0.22,1,0.36,1)_both]"
    >
      {candidates.map((c, i) => (
        <button
          key={c.type}
          role="option"
          aria-selected={i === activeIndex}
          onMouseDown={(e) => {
            // mousedown, not click — the textarea blurs (and closes the menu)
            // before click fires.
            e.preventDefault()
            onSelect(c)
          }}
          onMouseEnter={() => onHover(i)}
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
            i === activeIndex ? "bg-white/[0.08]" : "hover:bg-white/[0.05]"
          }`}
        >
          <AgentAvatar type={c.type} size={30} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-medium text-white/90">
              @{c.name}
            </span>
            <span className="block truncate text-[11.5px] font-light text-white/40">
              {c.title}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {c.channels.map((k) => (
              <span
                key={k}
                title={k}
                className={`h-[7px] w-[7px] rounded-full ${CHANNEL_DOT[k] ?? "bg-white/30"}`}
              />
            ))}
          </span>
        </button>
      ))}
    </div>
  )
}
