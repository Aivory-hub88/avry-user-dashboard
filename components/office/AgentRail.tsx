"use client"
/**
 * Right column of the Console "working office" — a unified notification
 * feed for the active agent (approvals + missed replies in its other
 * threads), plus what it's running and connected to.
 *
 * The feed comes from useNotificationFeed() via the parent (Console page) —
 * see docs/CERVEAU-WORKING-OFFICE-PLANNING.md Phase 10. Approvals are
 * already deduped against whatever's rendered inline in the open thread
 * (Phase 3); this panel only ever renders the slice for `agentTarget`, not
 * a cross-agent view — Mission Control (Phase 9) is where "all agents at
 * once" lives.
 *
 * Collapsible, but never an overlay: OfficeShell owns collapse state and
 * sizes this as a real CSS Grid track (a fixed 56px column when collapsed,
 * a fixed screen *proportion* when open) — collapsing shrinks the track and
 * hands the freed space straight to the chat column, so it's always a push,
 * never a panel floating on top of content. Same three-pane behaviour as
 * Grok Bot's layout.
 *
 * Every approval, activity, and status item renders through the one
 * `NotificationCard` shape (icon, title, secondary line, timestamp) —
 * macOS Notification Center's own move: one neutral card language, not a
 * different visual treatment per kind. `Bar` survives only for the
 * Aivory-Console placeholder copy and the "Running now"/"Connected
 * channels" sections below, which are reference state, not notifications.
 *
 * Aivory Console (agentTarget === null) gets its own copy rather than the
 * feed/deployment sections — it's the direct SSE chat, not a deployable
 * agent behind the F-1 gate, so "Could not load approvals" or "Not deployed
 * anywhere yet" would be true-sounding but meaningless there.
 */
import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { ChevronLeft, ChevronRight, Brain } from "lucide-react"
// Notification-card glyphs specifically use Ionicons (MIT-licensed, part of
// react-icons) rather than Lucide — Ionicons' filled "ios" style is what
// real iOS/macOS system notifications (Low Battery, Screen Time, etc.) use:
// solid glyphs, not thin outlines. Apple's own SF Symbols are proprietary
// and licensed only for software running on Apple platforms, so they
// aren't an option to embed in this web dashboard — Ionicons is the
// legitimately-licensed way to get that same visual language.
import { IoWarning, IoCheckmarkCircle, IoCheckmark, IoChatbubbleEllipses } from "react-icons/io5"
import { asset } from "@/lib/asset"
import { PREBUILT_AGENTS, type AgentDeployment } from "@/lib/agentChat"
import { describeTool, toolkitIconPath, readVerifierFinding, type PendingApproval } from "@/lib/agentApprovals"
import type { Notification } from "@/types/notifications"
import { AgentAvatar } from "@/components/office/AgentAvatar"
import { NotificationCard } from "@/components/office/NotificationCard"
import { MemoryModal } from "@/components/office/MemoryModal"

function relativeTime(ts: number): string {
  const diffMs = Date.now() - ts
  const mins = Math.round(diffMs / 60_000)
  if (mins < 1) return "now"
  if (mins < 60) return `${mins}m`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.round(hours / 24)}d`
}

const CHANNEL_ICON: Record<string, string> = {
  telegram: "/integrations/telegram.svg",
  slack: "/integrations/slack.svg",
}

/** The shared strip every status line in this rail is built from. */
function Bar({ tone = "idle", children }: { tone?: "idle" | "warn"; children: React.ReactNode }) {
  return (
    <div
      className={`w-full rounded-lg px-3.5 py-2.5 text-[12.5px] font-light leading-[1.55] ${
        tone === "warn" ? "bg-amber/10 text-white/70" : "bg-white/[0.035] text-white/45"
      }`}
    >
      {children}
    </div>
  )
}

interface AgentRailProps {
  agentTarget: string | null
  /** Already sliced to this agent's own items — see useNotificationFeed. */
  notifications: Notification[]
  approvalsError: boolean
  onResolveApproval: (approval: PendingApproval, decision: "approve" | "deny") => Promise<void>
  onRetryApprovals: () => void
  onOpenThread: (sessionId: string) => void
  deployments: AgentDeployment[]
  /** Controlled by OfficeShell — it owns the grid track sizing, this
   *  component just renders itself accordingly. */
  collapsed?: boolean
  onToggleCollapse?: () => void
}

export default function AgentRail({
  agentTarget,
  notifications,
  approvalsError,
  onResolveApproval,
  onRetryApprovals,
  onOpenThread,
  deployments,
  collapsed = false,
  onToggleCollapse,
}: AgentRailProps) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [resolveError, setResolveError] = useState<string | null>(null)
  const [memoryOpen, setMemoryOpen] = useState(false)

  const title = agentTarget
    ? PREBUILT_AGENTS.find((a) => a.type === agentTarget)?.title ?? agentTarget
    : "Aivory Console"

  const approvalItems = notifications.filter((n): n is Extract<Notification, { kind: "approval" }> => n.kind === "approval")
  const activityItems = notifications.filter((n): n is Extract<Notification, { kind: "activity" }> => n.kind === "activity")
  const channels = agentTarget ? deployments.filter((d) => d.agentType === agentTarget) : []
  const notDeployed = agentTarget !== null && channels.length === 0

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
        {notifications.length > 0 && (
          <span className="mt-2 rounded-full bg-amber/13 px-[6px] py-[2px] text-[11px] font-bold text-amber">
            {notifications.length}
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
        {/* Not <h2> — a global `main h2` style overrides Tailwind's own
            font-size on any heading tag, which is what made this render at
            24px regardless of the class here. This is chrome, not a page
            heading. */}
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium leading-none text-white/55">{title}</span>
        {agentTarget !== null && (
          <button
            onClick={() => setMemoryOpen(true)}
            aria-label={`What ${title} remembers`}
            title={`What ${title} remembers`}
            className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[8px] text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <Brain className="h-[14px] w-[14px]" />
          </button>
        )}
      </div>

      <MemoryModal agentType={agentTarget} agentTitle={title} open={memoryOpen} onClose={() => setMemoryOpen(false)} />

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
                <span className="text-[12px] font-semibold leading-none text-white/65">Notifications</span>
                <span className={`text-[11px] ${notifications.length > 0 ? "text-amber" : "text-white/30"}`}>
                  {notifications.length}
                </span>
              </div>

              {approvalsError && (
                <NotificationCard
                  tone="error"
                  icon={<IoWarning className="h-[15px] w-[15px]" />}
                  title="Could not load approvals"
                  subtitle="Tap to try again."
                  onClick={onRetryApprovals}
                />
              )}
              {resolveError && (
                <NotificationCard tone="error" icon={<IoWarning className="h-[15px] w-[15px]" />} title={resolveError} />
              )}
              {notDeployed && (
                <NotificationCard
                  tone="warn"
                  icon={<IoWarning className="h-[15px] w-[15px]" />}
                  title="Not deployed anywhere yet"
                  subtitle="Connect it to Telegram, Slack, or WhatsApp to reach it outside Console."
                  actions={
                    <Link
                      href="/agents"
                      className="text-[12px] font-medium text-[#FFB454] underline underline-offset-2 transition-colors hover:text-[#ffc57a]"
                    >
                      Deploy this agent
                    </Link>
                  }
                />
              )}
              {!approvalsError && notifications.length === 0 && !notDeployed && (
                <div className="px-0.5 text-[12.5px] font-light text-white/35">Nothing new right now.</div>
              )}

              {approvalItems.map(({ approval: a }) => {
                const busy = busyId === a.id
                // A real approval is always about a specific tool/service —
                // Gmail, Slack, whatever's being called. Show that service's
                // own brand icon (the same /integrations/*.svg set the rest
                // of the dashboard already uses) instead of a generic glyph
                // whenever the tool name resolves to one; only a bare
                // loopback tool with no toolkit prefix falls back.
                const brandIcon = toolkitIconPath(a.tool_name)
                // ADR-008 Phase 3a: `verifier_brain` may have already looked at
                // this call and left a finding. It is advisory only — the
                // verifier runs with zero tools and cannot resolve anything —
                // so it never replaces the decision, only informs it.
                //
                // The badge is the one place strong enough to carry "look
                // closer at this one" without a second colour treatment, so a
                // flag takes it over; everything else keeps the standing label,
                // which the Approve/Deny buttons already imply anyway.
                //
                // `confidence` is deliberately not shown: nothing calibrates
                // it, and an uncalibrated 0.85 next to a sentence reads as
                // precision the number does not have.
                const finding = readVerifierFinding(a)
                const subtitle =
                  finding === null
                    ? "Waiting for your decision."
                    : finding.verdict === "error"
                      ? "Automated check didn't complete — use your own judgement."
                      : `Automated check: ${finding.reasoning}`
                return (
                  <NotificationCard
                    key={a.id}
                    tone="warn"
                    badge={finding?.verdict === "flag" ? "Flagged" : "Needs approval"}
                    icon={
                      brandIcon ? (
                        <Image src={asset(brandIcon)} alt="" width={18} height={18} className="rounded-[4px]" />
                      ) : (
                        <IoCheckmarkCircle className="h-[16px] w-[16px]" />
                      )
                    }
                    title={describeTool(a.tool_name)}
                    subtitle={subtitle}
                    actions={
                      <>
                        <button
                          onClick={() => decide(a, "approve")}
                          disabled={busy}
                          aria-busy={busy}
                          className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-[12.5px] font-semibold text-on-accent transition-[opacity,transform] duration-150 ease-out hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.97] disabled:opacity-50"
                        >
                          <IoCheckmark className="h-[13px] w-[13px]" />
                          {busy ? "Approving…" : "Approve"}
                        </button>
                        <button
                          onClick={() => decide(a, "deny")}
                          disabled={busy}
                          aria-busy={busy}
                          className="text-[12.5px] font-medium text-white/45 underline underline-offset-2 transition-colors hover:text-white/75 active:scale-[0.97] disabled:opacity-50"
                        >
                          Deny
                        </button>
                      </>
                    }
                  />
                )
              })}

              {activityItems.map((item) => (
                <NotificationCard
                  key={item.id}
                  icon={<IoChatbubbleEllipses className="h-[15px] w-[15px]" />}
                  title={`New reply in “${item.title}”`}
                  meta={relativeTime(item.updatedAt)}
                  onClick={() => onOpenThread(item.sessionId)}
                />
              ))}
            </section>

            <section className="mt-[20px] flex flex-col gap-[8px]">
              <span className="px-0.5 text-[12px] font-semibold leading-none text-white/65">Running now</span>
              <Bar tone="idle">Not running anything right now.</Bar>
            </section>

            {channels.length > 0 && (
              <section className="mt-[20px] flex flex-col gap-[8px]">
                <span className="px-0.5 text-[12px] font-semibold leading-none text-white/65">Connected channels</span>
                {channels.map((c) => (
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
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
