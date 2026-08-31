"use client"
/**
 * Right column of the Console "working office" — what the active agent is
 * waiting on, running, and connected to.
 *
 * Approvals come from useAgentApprovals() via the parent (Console page),
 * already deduped against whatever's rendered inline in the open thread —
 * see docs/CERVEAU-WORKING-OFFICE-PLANNING.md Phase 3.
 *
 * Push-vs-float (Phase 4): above ~1500px total width the rail pushes the
 * chat column (a normal flex child); below that it floats over the chat
 * instead, so the reading column never loses width. The 56px stub stays in
 * the normal flex flow either way — only the expanded panel becomes an
 * overlay in float mode. `mode` is computed by OfficeShell via useRailMode
 * and injected as a prop.
 *
 * The rail never opens itself. It opens once, automatically, the first time
 * approvals finish loading if something is already waiting — after that,
 * only the user's own toggle click changes `open`. A new approval landing
 * later never grabs focus out from under whatever the user is doing.
 */
import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import { ChevronRight } from "lucide-react"
import { asset } from "@/lib/asset"
import { PREBUILT_AGENTS, listDeployments, type AgentDeployment } from "@/lib/agentChat"
import { describeTool, type PendingApproval } from "@/lib/agentApprovals"
import type { RailMode } from "@/hooks/useRailMode"
import { AgentAvatar } from "@/components/office/AgentAvatar"

const CHANNEL_ICON: Record<string, string> = {
  telegram: "/integrations/telegram.svg",
  slack: "/integrations/slack.svg",
}

interface AgentRailProps {
  agentTarget: string | null
  approvalsByAgent: Record<string, PendingApproval[]>
  approvalsLoaded: boolean
  approvalsError: boolean
  onResolveApproval: (approval: PendingApproval, decision: "approve" | "deny") => Promise<void>
  mode?: RailMode
}

export default function AgentRail({
  agentTarget,
  approvalsByAgent,
  approvalsLoaded,
  approvalsError,
  onResolveApproval,
  mode = "dock",
}: AgentRailProps) {
  const [open, setOpen] = useState(false)
  const [deployments, setDeployments] = useState<AgentDeployment[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [resolveError, setResolveError] = useState<string | null>(null)
  const fetchedRef = useRef(false)
  const initializedOpenRef = useRef(false)

  useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true
    listDeployments().then(setDeployments).catch(() => {})
  }, [])

  const title = agentTarget
    ? PREBUILT_AGENTS.find((a) => a.type === agentTarget)?.title ?? agentTarget
    : "Aivory Console"

  // Aivory Console (agentTarget === null) has no approval concept — it's
  // the SSE chat path, not a deployable agent behind the F-1 gate.
  const mine = agentTarget ? approvalsByAgent[agentTarget] ?? [] : []
  const channels = agentTarget ? deployments.filter((d) => d.agentType === agentTarget) : []

  // One-time only: once real data has loaded, open if there's something
  // waiting. Deliberately not keyed on `mine` after that — a fresh arrival
  // must never flip this again.
  useEffect(() => {
    if (initializedOpenRef.current || !approvalsLoaded) return
    initializedOpenRef.current = true
    // Sync-from-prop, once: same documented pattern as useChat.ts's
    // session-restore effect and AgentColumn's agentTarget sync.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (mine.length > 0) setOpen(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approvalsLoaded])

  const decide = async (approval: PendingApproval, decision: "approve" | "deny") => {
    setBusyId(approval.id)
    setResolveError(null)
    try {
      await onResolveApproval(approval, decision)
    } catch {
      setResolveError(`Could not ${decision} — try again.`)
    } finally {
      setBusyId(null)
    }
  }

  const stub = (
    <div className="flex h-full w-14 shrink-0 flex-col items-center gap-3 border-l border-white/[0.045] bg-[#2f2f2c] pt-4">
      <button
        onClick={() => setOpen(true)}
        aria-label="Expand agent panel"
        className="grid h-[26px] w-[26px] place-items-center rounded-[8px] text-white/50 hover:bg-white/[0.06] hover:text-white"
      >
        <ChevronRight className="h-[14px] w-[14px] rotate-180" />
      </button>
      {mine.length > 0 && (
        <span className="rounded-full bg-[rgba(217,171,110,0.13)] px-[6px] py-[2px] text-[11px] font-bold text-[#d9ab6e]">
          {mine.length}
        </span>
      )}
    </div>
  )

  if (!open) return stub

  const panel = (
    <div
      className={`flex h-full w-[330px] flex-col border-l border-white/[0.045] bg-[#2f2f2c] ${
        mode === "float" ? "shadow-[-10px_0_22px_rgba(0,0,0,0.28)]" : ""
      }`}
      style={mode === "float" ? { backdropFilter: "blur(16px)", backgroundColor: "rgba(47,47,44,0.92)" } : undefined}
    >
      <div className="flex items-center gap-[10px] border-b border-white/[0.045] px-4 py-[15px]">
        <button
          onClick={() => setOpen(false)}
          aria-label="Collapse agent panel"
          className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[8px] text-white/50 hover:bg-white/[0.06] hover:text-white"
        >
          <ChevronRight className="h-[14px] w-[14px]" />
        </button>
        <AgentAvatar type={agentTarget} size={24} />
        <h2 className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">{title}</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-[14px] py-[14px]">
        <section className="flex flex-col gap-[9px]">
          <div className="flex items-baseline gap-[7px]">
            <h4 className="text-[12px] font-semibold text-white/65">Waiting on you</h4>
            <span className={`text-[11px] ${mine.length > 0 ? "text-[#d9ab6e]" : "text-white/30"}`}>{mine.length}</span>
          </div>
          {approvalsError && <p className="text-[12.5px] font-light text-white/30">Could not load approvals.</p>}
          {resolveError && <p className="text-[12.5px] font-light text-[#d9ab6e]">{resolveError}</p>}
          {!approvalsError && mine.length === 0 && (
            <p className="text-[12.5px] font-light text-white/30">Nothing waiting on you.</p>
          )}
          {mine.map((a) => (
            <div key={a.id} className="flex flex-col gap-[8px] rounded-[11px] border border-[rgba(217,171,110,0.26)] bg-[#3a3a36] p-[12px]">
              <p className="text-[13px] font-light leading-[1.5] text-white">{describeTool(a.tool_name)}</p>
              <div className="flex gap-[8px]">
                <button
                  onClick={() => decide(a, "approve")}
                  disabled={busyId === a.id}
                  className="rounded-[7px] bg-accent px-[11px] py-[4px] text-[12px] font-medium text-[#1a1a18] transition hover:opacity-90 disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  onClick={() => decide(a, "deny")}
                  disabled={busyId === a.id}
                  className="rounded-[7px] border border-white/[0.12] px-[11px] py-[4px] text-[12px] font-medium text-white/70 transition hover:bg-white/[0.05] disabled:opacity-50"
                >
                  Deny
                </button>
              </div>
            </div>
          ))}
        </section>

        <section className="mt-[22px] flex flex-col gap-[9px]">
          <div className="flex items-baseline gap-[7px]">
            <h4 className="text-[12px] font-semibold text-white/65">Running now</h4>
          </div>
          <p className="text-[12.5px] font-light text-white/30">Not running anything right now.</p>
        </section>

        <section className="mt-[22px] flex flex-col gap-[9px]">
          <h4 className="text-[12px] font-semibold text-white/65">Connected channels</h4>
          {channels.length === 0 ? (
            <p className="text-[12.5px] font-light text-white/30">Not deployed anywhere yet.</p>
          ) : (
            <div className="flex flex-col gap-[6px]">
              {channels.map((c) => (
                <div key={c.id} className="flex items-center gap-[7px] rounded-[8px] border border-white/[0.07] px-[9px] py-[6px]">
                  {CHANNEL_ICON[c.kind] ? (
                    <Image src={asset(CHANNEL_ICON[c.kind])} alt={c.kind} width={14} height={14} className="shrink-0 rounded-[3px]" />
                  ) : (
                    <span className="h-[6px] w-[6px] shrink-0 rounded-full bg-accent" />
                  )}
                  <span className="truncate text-[12px] font-light text-white/75">{c.label}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )

  if (mode === "float") {
    // The stub stays docked (reserves its own 56px in flow) while the full
    // panel floats on top, anchored to OfficeShell's `relative` root — the
    // chat column's width never changes because of this.
    return (
      <>
        {stub}
        <div className="absolute right-0 top-0 z-10 h-full">{panel}</div>
      </>
    )
  }

  return panel
}
