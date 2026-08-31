"use client"
/**
 * Right column of the Console "working office" — what the active agent is
 * waiting on, running, and connected to.
 *
 * Approvals come from useAgentApprovals() via the parent (Console page),
 * already deduped against whatever's rendered inline in the open thread —
 * see docs/CERVEAU-WORKING-OFFICE-PLANNING.md Phase 3.
 *
 * Collapsible, but never an overlay: OfficeShell owns collapse state and
 * sizes this as a real CSS Grid track (a fixed 56px column when collapsed,
 * a fixed screen *proportion* when open) — collapsing shrinks the track and
 * hands the freed space straight to the chat column, so it's always a push,
 * never a panel floating on top of content. Same three-pane behaviour as
 * Grok Bot's layout.
 *
 * Every status line in this panel is the same `Bar` molecule — a tinted
 * strip with an underlined action inline, the same DNA as the deploy
 * notice banner above the chat, varied per row: a link-first sentence for
 * the notice banner, a link-last sentence for "not deployed" here, two
 * inline actions instead of one for a pending approval, no action at all
 * for a plain status line. One visual family, several shapes.
 *
 * Aivory Console (agentTarget === null) gets its own copy rather than the
 * approval/deployment sections — it's the direct SSE chat, not a deployable
 * agent behind the F-1 gate, so "Could not load approvals" or "Not deployed
 * anywhere yet" would be true-sounding but meaningless there.
 */
import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { ChevronLeft, ChevronRight, Check } from "lucide-react"
import { asset } from "@/lib/asset"
import { PREBUILT_AGENTS, type AgentDeployment } from "@/lib/agentChat"
import { describeTool, type PendingApproval } from "@/lib/agentApprovals"
import { AgentAvatar } from "@/components/office/AgentAvatar"

const CHANNEL_ICON: Record<string, string> = {
  telegram: "/integrations/telegram.svg",
  slack: "/integrations/slack.svg",
}

/** The shared strip every status line in this rail is built from. */
function Bar({ tone = "idle", children }: { tone?: "idle" | "warn"; children: React.ReactNode }) {
  return (
    <div
      className={`w-full rounded-lg px-3.5 py-2.5 text-[12.5px] font-light leading-[1.55] ${
        tone === "warn" ? "bg-[rgba(217,171,110,0.1)] text-white/70" : "bg-white/[0.035] text-white/45"
      }`}
    >
      {children}
    </div>
  )
}

/** The underlined actionable word/phrase inside a Bar — a link or a button. */
function BarAction({
  onClick,
  href,
  muted,
  disabled,
  children,
}: {
  onClick?: () => void
  href?: string
  muted?: boolean
  disabled?: boolean
  children: React.ReactNode
}) {
  const className = `font-medium underline underline-offset-2 transition-colors ${
    disabled
      ? "text-white/30 no-underline"
      : muted
        ? "text-white/70 hover:text-white"
        : "text-[#e8c088] hover:text-[#f0cd9c]"
  }`
  if (href) return <Link href={href} className={className}>{children}</Link>
  return (
    <button onClick={onClick} disabled={disabled} className={className}>
      {children}
    </button>
  )
}

interface AgentRailProps {
  agentTarget: string | null
  approvalsByAgent: Record<string, PendingApproval[]>
  approvalsError: boolean
  onResolveApproval: (approval: PendingApproval, decision: "approve" | "deny") => Promise<void>
  onRetryApprovals: () => void
  deployments: AgentDeployment[]
  /** Controlled by OfficeShell — it owns the grid track sizing, this
   *  component just renders itself accordingly. */
  collapsed?: boolean
  onToggleCollapse?: () => void
}

export default function AgentRail({
  agentTarget,
  approvalsByAgent,
  approvalsError,
  onResolveApproval,
  onRetryApprovals,
  deployments,
  collapsed = false,
  onToggleCollapse,
}: AgentRailProps) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [resolveError, setResolveError] = useState<string | null>(null)

  const title = agentTarget
    ? PREBUILT_AGENTS.find((a) => a.type === agentTarget)?.title ?? agentTarget
    : "Aivory Console"

  const mine = agentTarget ? approvalsByAgent[agentTarget] ?? [] : []
  const channels = agentTarget ? deployments.filter((d) => d.agentType === agentTarget) : []

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

  if (collapsed) {
    return (
      <div className="flex h-full w-full flex-col items-center border-l border-white/[0.045] bg-[#2f2f2c] pt-4">
        <button
          onClick={onToggleCollapse}
          aria-label="Expand agent panel"
          title="Expand agent panel"
          className="mb-3 grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[8px] text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          <ChevronLeft className="h-[14px] w-[14px]" />
        </button>
        <AgentAvatar type={agentTarget} size={30} />
        {mine.length > 0 && (
          <span className="mt-2 rounded-full bg-[rgba(217,171,110,0.13)] px-[6px] py-[2px] text-[11px] font-bold text-[#d9ab6e]">
            {mine.length}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col border-l border-white/[0.045] bg-[#2f2f2c]">
      <div className="flex items-center gap-[10px] border-b border-white/[0.045] px-4 py-[15px]">
        <button
          onClick={onToggleCollapse}
          aria-label="Collapse agent panel"
          title="Collapse agent panel"
          className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[8px] text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          <ChevronRight className="h-[14px] w-[14px]" />
        </button>
        <AgentAvatar type={agentTarget} size={24} />
        <h2 className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">{title}</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-[14px] py-[14px]">
        {agentTarget === null ? (
          <Bar tone="idle">
            Aivory Console is the direct chat — it doesn&apos;t run behind an approval gate and isn&apos;t deployed
            anywhere on its own. Switch to one of your agents to see what it&apos;s waiting on.
          </Bar>
        ) : (
          <>
            <section className="flex flex-col gap-[8px]">
              <div className="flex items-baseline gap-[7px] px-0.5">
                <h4 className="text-[12px] font-semibold text-white/65">Waiting on you</h4>
                <span className={`text-[11px] ${mine.length > 0 ? "text-[#d9ab6e]" : "text-white/30"}`}>{mine.length}</span>
              </div>

              {approvalsError && (
                <Bar tone="warn">
                  <BarAction onClick={onRetryApprovals}>Could not load approvals</BarAction> — tap to try again.
                </Bar>
              )}
              {resolveError && <Bar tone="warn">{resolveError}</Bar>}
              {!approvalsError && mine.length === 0 && <Bar tone="idle">Nothing waiting on you.</Bar>}

              {mine.map((a) => {
                const busy = busyId === a.id
                return (
                  <div
                    key={a.id}
                    className="relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-white/[0.07] p-4"
                    style={{
                      backgroundColor: "#3a3a36",
                      backgroundImage:
                        "radial-gradient(circle at 12% 15%, rgba(183,203,166,0.22), transparent 42%)," +
                        "radial-gradient(circle at 88% 12%, rgba(217,171,110,0.18), transparent 46%)," +
                        "radial-gradient(circle at 65% 95%, rgba(143,179,217,0.16), transparent 55%)",
                    }}
                  >
                    <span className="w-fit rounded-full bg-[rgba(217,171,110,0.16)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#e8c088]">
                      Needs approval
                    </span>
                    <p className="text-[19px] font-semibold leading-[1.25] tracking-[-0.01em] text-white">
                      {describeTool(a.tool_name)}
                    </p>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => decide(a, "approve")}
                        disabled={busy}
                        aria-busy={busy}
                        className="flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-[13px] font-semibold text-[#1a1a18] transition-[opacity,transform] hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.97] disabled:opacity-50"
                      >
                        <Check className="h-[13px] w-[13px]" />
                        {busy ? "Approving…" : "Approve"}
                      </button>
                      <button
                        onClick={() => decide(a, "deny")}
                        disabled={busy}
                        aria-busy={busy}
                        className="text-[13px] font-medium text-white/45 underline underline-offset-2 transition-colors hover:text-white/75 disabled:opacity-50"
                      >
                        Deny
                      </button>
                    </div>
                  </div>
                )
              })}
            </section>

            <section className="mt-[20px] flex flex-col gap-[8px]">
              <h4 className="px-0.5 text-[12px] font-semibold text-white/65">Running now</h4>
              <Bar tone="idle">Not running anything right now.</Bar>
            </section>

            <section className="mt-[20px] flex flex-col gap-[8px]">
              <h4 className="px-0.5 text-[12px] font-semibold text-white/65">Connected channels</h4>
              {channels.length === 0 ? (
                <Bar tone="warn">
                  Not deployed anywhere yet — <BarAction href="/agents">deploy this agent</BarAction> to reach it
                  outside Console.
                </Bar>
              ) : (
                channels.map((c) => (
                  <Bar key={c.id} tone="idle">
                    <span className="flex items-center gap-[7px]">
                      {CHANNEL_ICON[c.kind] ? (
                        <Image src={asset(CHANNEL_ICON[c.kind])} alt={c.kind} width={14} height={14} className="shrink-0 rounded-[3px]" />
                      ) : (
                        <span className="h-[6px] w-[6px] shrink-0 rounded-full bg-accent" />
                      )}
                      <span className="truncate text-white/75">{c.label}</span>
                    </span>
                  </Bar>
                ))
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
