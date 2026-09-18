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
import { useEffect, useState } from "react"
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
import { IoWarning, IoCheckmarkCircle, IoChatbubbleEllipses, IoAt } from "react-icons/io5"
import { asset } from "@/lib/asset"
import { PREBUILT_AGENTS, type AgentDeployment } from "@/lib/agentChat"
import type { MentionCandidate } from "@/lib/agentMentions"
import type { ActiveAgentRun } from "@/lib/agentRuns"
import { describeTool, toolkitIconPath, readVerifierFinding } from "@/lib/agentApprovals"
import type { Notification } from "@/types/notifications"
import { AgentAvatar } from "@/components/office/AgentAvatar"
import { NotificationCard } from "@/components/office/NotificationCard"
import { MemoryModal } from "@/components/office/MemoryModal"
import { useWorkspaceAwareness } from "@/hooks/useWorkspaceAwareness"
import { CHANNEL_ICON, relativeTime, formatBadgeCount } from "@/lib/officeRows"

const CHANNEL_LABEL: Record<string, string> = {
  console: "Console",
  telegram: "Telegram",
  slack: "Slack",
}

/** The shared strip every status line in this rail is built from. */
function Bar({ tone = "idle", children }: { tone?: "idle" | "warn"; children: React.ReactNode }) {
  return (
    <div
      className={`w-full rounded-lg px-3.5 py-2.5 text-[12.5px] font-light leading-[1.55] ${
        tone === "warn" ? "bg-amber/10 text-white/70" : "bg-white/[0.035] text-white/80"
      }`}
    >
      {children}
    </div>
  )
}

/**
 * Room membership as a real notification card, not a grey strip — the strip
 * blended into the rail background and read as inert copy. This uses the
 * macOS Notification Center language the feed already speaks (neutral card,
 * colour carried by the glyph + badge only, never a tint wash): `info` tone
 * = Apple's dark-mode systemBlue, which no other rail state uses — approvals
 * are orange, failures are red — so the Room reads as its own category at a
 * glance, exactly how different apps' notifications separate in the Center.
 */
function RoomCard({ members }: { members: MentionCandidate[] }) {
  return (
    <NotificationCard
      tone="info"
      badge="Room"
      icon={<IoAt className="h-[15px] w-[15px]" />}
      title={
        members.length > 0
          ? `Room · ${members.map((m) => m.name).join(", ")}`
          : "Room · no deployed agents"
      }
      subtitle={
        members.length > 0
          ? "Type @ to mention — mentioned agents answer side by side. No @mention goes to the direct console brain."
          : "Deploy an agent first — @ only lists agents running somewhere."
      }
      actions={
        members.length === 0 ? (
          <Link
            href="/agents"
            className="text-[12px] font-medium text-[#5AA9FF] underline underline-offset-2 transition-colors hover:text-[#8ac2ff]"
          >
            Deploy an agent
          </Link>
        ) : undefined
      }
    />
  )
}

interface AgentRailProps {
  workspaceId: string | null
  agentTarget: string | null
  /** Already sliced to this agent's own items — see useNotificationFeed. */
  notifications: Notification[]
  approvalsError: boolean
  onRetryApprovals: () => void
  onOpenThread: (sessionId: string) => void
  deployments: AgentDeployment[]
  /** Present when this agent has a turn in flight right now (Console chat,
   *  Telegram, or Slack) — see hooks/useActiveRuns.ts. `undefined` means
   *  not running, not "unknown". */
  activeRun?: ActiveAgentRun
  /** Ledger rows stuck past SLA with no live turn behind them — see
   *  hooks/useStuckTasks.ts. Rendered with a Stop action under Running now.
   *  Empty/absent = nothing stuck, section hidden. */
  stuckTasks?: import("@/lib/airaTasks").EnrichedTask[]
  /** Stop-button handler from useStuckTasks.stopTask (parent-owned). */
  onStopTask?: (taskId: string) => void
  /** Task currently being stopped (disables its button). */
  stoppingTaskId?: string | null
  /** Last stop failure, shown once under the section. */
  stopTaskError?: string | null
  /** Room mode (Mission Control chat): the rail gains a Room card atop the
   *  Notifications section listing who @ can reach — deployed agents only.
   *  This replaces the old top-toast, which overlapped the header. */
  inRoom?: boolean
  roomMembers?: MentionCandidate[]
  /** Controlled by OfficeShell — it owns the grid track sizing, this
   *  component just renders itself accordingly. */
  collapsed?: boolean
  onToggleCollapse?: () => void
}

export default function AgentRail({
  workspaceId,
  agentTarget,
  notifications,
  approvalsError,
  onRetryApprovals,
  onOpenThread,
  deployments,
  activeRun,
  stuckTasks = [],
  onStopTask,
  stoppingTaskId = null,
  stopTaskError = null,
  inRoom = false,
  roomMembers = [],
  collapsed = false,
  onToggleCollapse,
}: AgentRailProps) {
  const [memoryOpen, setMemoryOpen] = useState(false)
  const awarenessPeers = useWorkspaceAwareness(workspaceId)
  const [, forceNow] = useState(0)
  useEffect(() => {
    const id = setInterval(() => forceNow((n) => n + 1), 60000)
    return () => clearInterval(id)
  }, [])

  const title = agentTarget
    ? PREBUILT_AGENTS.find((a) => a.type === agentTarget)?.name ?? agentTarget
    : "Aivory Console"

  const approvalItems = notifications.filter((n): n is Extract<Notification, { kind: "approval" }> => n.kind === "approval")
  const activityItems = notifications.filter((n): n is Extract<Notification, { kind: "activity" }> => n.kind === "activity")
  const statusItems = notifications.filter((n): n is Extract<Notification, { kind: "status" }> => n.kind === "status")
  const channels = agentTarget ? deployments.filter((d) => d.agentType === agentTarget) : []
  const notDeployed = agentTarget !== null && channels.length === 0
  const visibleAwarenessPeers = workspaceId ? awarenessPeers : []

  // NOTE (conversational approval protocol): the rail used to resolve
  // approvals from inline Approve/Deny buttons here. Those are gone — the
  // agent asks in plain language and the user's next short reply ("Ya" /
  // "Batal", multilingual) IS the decision, resolved server-side. The rail
  // only informs; it never decides.

  if (collapsed) {
    return (
      <div className="flex h-full w-full flex-col items-center bg-surface-1 pt-4">
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
            {formatBadgeCount(notifications.length)}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col bg-surface-1">
      <div className="flex h-12 shrink-0 items-center gap-[10px] border-b border-transparent bg-surface-1/70 px-4 backdrop-blur-xl">
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
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium leading-none text-white">{title}</span>
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
        {/* Console itself isn't approval-gated, but an approval whose
            `_agent_type` is missing (an older Cerveau) is grouped under this
            same `null` key rather than a made-up bucket no row reads — see
            listPendingApprovalsByAgent. So the placeholder only wins when
            there's genuinely nothing to show; a real notification here still
            gets the full list below instead of being hidden behind it. */}
        {agentTarget === null && notifications.length === 0 ? (
          // Room gets the card, not the grey strip — same reason as below:
          // the strip is invisible-in-plain-sight, the card isn't.
          inRoom ? (
            <RoomCard members={roomMembers} />
          ) : (
            <Bar tone="idle">
              Aivory Console is the direct chat — it doesn&apos;t run behind an approval gate and isn&apos;t deployed
              anywhere on its own. Switch to one of your agents to see what it&apos;s waiting on.
            </Bar>
          )
        ) : (
          <>
            <section className="flex flex-col gap-[8px]">
              <div className="flex items-baseline gap-[7px] px-0.5">
                <span className="text-[12px] font-semibold leading-none text-white/65">Notifications</span>
                <span className={`text-[11px] ${notifications.length > 0 ? "text-amber" : "text-white/50"}`}>
                  {notifications.length}
                </span>
              </div>

              {/* Room membership lives here, not in a top toast — the toast
                  overlapped the header and scrolled away with nothing. Same
                  card language as every other notification (info tone). */}
              {inRoom && <RoomCard members={roomMembers} />}

              {approvalsError && (
                <NotificationCard
                  tone="error"
                  icon={<IoWarning className="h-[15px] w-[15px]" />}
                  title="Could not load approvals"
                  subtitle="Tap to try again."
                  onClick={onRetryApprovals}
                />
              )}
              {notDeployed && (
                <NotificationCard
                  tone="warn"
                  icon={<IoWarning className="h-[15px] w-[15px]" />}
                  title="Not deployed anywhere yet"
                  subtitle="Connect it to Telegram or Slack to reach it outside Console."
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
                <div className="px-0.5 text-[12.5px] font-light text-white/70">Nothing new right now.</div>
              )}

              {approvalItems.map(({ approval: a }) => {
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
                // ADR-009 Phase 3: an approval raised by a scheduled run
                // fired while nobody was watching. Saying "Waiting for your
                // decision" over it is not just uninformative, it is wrong —
                // it implies a turn is blocked on the reader when nothing is.
                const scheduled = a.unattended === true
                const origin = a.origin_message?.trim()
                const subtitle =
                  finding === null
                    ? scheduled
                      ? origin
                        ? `Ran on a schedule: “${origin}”`
                        : "Ran on a schedule — nothing is blocked while this waits."
                      : "Waiting for your decision."
                    : finding.verdict === "error"
                      ? "Automated check didn't complete — use your own judgement."
                      : `Automated check: ${finding.reasoning}`
                return (
                  <NotificationCard
                    key={a.id}
                    tone="warn"
                    // The badge carries the most informative thing available,
                    // in that order: a flag beats where it came from, which
                    // beats "Needs approval".
                    badge={
                      finding?.verdict === "flag"
                        ? "Flagged"
                        : scheduled
                          ? "Scheduled run"
                          : "Needs approval"
                    }
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
                      <span className="text-[12.5px] font-light text-white/55">
                        Balas <span className="font-medium text-white/85">Ya</span> di chat untuk
                        menyetujui, <span className="font-medium text-white/85">Batal</span> untuk
                        membatalkan.
                      </span>
                    }
                  />
                )
              })}

              {/* ADR-009 Phase 3: a scheduled run Cerveau has reported as
                  failed. `error` tone rather than `warn` on purpose — this
                  is not a decision waiting for someone, it is work the
                  customer believes is happening that is not. No action
                  button: fixing it means editing the schedule, which lives
                  in Customise Agent, and a button that only opens another
                  screen is worse than the sentence that says where to go. */}
              {statusItems.map((item) => (
                <NotificationCard
                  key={item.id}
                  tone="error"
                  badge="Not running"
                  icon={<IoWarning className="h-[16px] w-[16px]" />}
                  title={`Scheduled run “${item.title}” isn’t running`}
                  subtitle={
                    item.detail
                      ? `${item.detail} — fix it under Customise agent → Schedules.`
                      : "Fix it under Customise agent → Schedules."
                  }
                />
              ))}

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

             {visibleAwarenessPeers.length > 0 && (
              <section className="mt-[20px] flex flex-col gap-[8px]">
                <span className="px-0.5 text-[12px] font-semibold leading-none text-white">Active in Workspace</span>
                <Bar tone="idle">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
                    <span className="text-white/85">
                       {visibleAwarenessPeers.map((p) => p.name).join(" · ")} · {visibleAwarenessPeers.length} active collaborator
                      {visibleAwarenessPeers.length !== 1 ? "s" : ""}
                    </span>
                    <span className="ml-1 flex items-center gap-1">
                       {visibleAwarenessPeers.map((p, i) => (
                        <span
                          key={i}
                          className="h-2 w-2 shrink-0 rounded-full border border-white/10"
                          style={{ background: p.color }}
                          title={`${p.name} (${p.agentType})`}
                        />
                      ))}
                    </span>
                  </span>
                   {agentTarget && visibleAwarenessPeers.some((p) => p.agentType === agentTarget) && (
                    <span className="mt-1 text-[11px] text-emerald-300">● {agentTarget} is editing now</span>
                  )}
                </Bar>
              </section>
            )}

            <section className="mt-[20px] flex flex-col gap-[8px]">
              <span className="px-0.5 text-[12px] font-semibold leading-none text-white">Running now</span>
              {activeRun ? (
                <Bar tone="idle">
                  <span className="flex items-center gap-[7px]">
                    <span className="h-[7px] w-[7px] shrink-0 animate-pulse rounded-full bg-emerald-400" />
                    <span className="text-white/85">
                      {(() => {
                        const channelName = CHANNEL_LABEL[activeRun.channel ?? ""]
                        const label = channelName ? `a ${channelName} message` : "a message"
                        const since = activeRun.started_at ? relativeTime(new Date(activeRun.started_at).getTime()) : null
                        return since && since !== "now"
                          ? `Working on ${label} — started ${since} ago`
                          : `Working on ${label} right now`
                      })()}
                    </span>
                  </span>
                </Bar>
              ) : (
                <Bar tone="idle">Not running anything right now.</Bar>
              )}
            </section>

            {stuckTasks.length > 0 && (
              <section className="mt-[20px] flex flex-col gap-[8px]">
                <span className="px-0.5 text-[12px] font-semibold leading-none text-white">
                  Stuck tasks
                  <span className="ml-1.5 rounded-full bg-amber/15 px-2 py-0.5 text-[11px] font-semibold text-amber">
                    {stuckTasks.length}
                  </span>
                </span>
                <span className="px-0.5 text-[11px] font-light text-white/35">
                  Past SLA with no live turn — stop them here, they won&apos;t finish on their own.
                </span>
                {stuckTasks.map((t) => (
                  <Bar key={t.task_id} tone="warn">
                    <span className="block truncate text-white/85" title={t.title}>
                      {t.title || "Untitled task"}
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-white/45">
                      <span className="tabular-nums">
                        {t.status === "blocked" ? "Waiting" : "Running"}
                        {t.blocked_reason ? ` · ${t.blocked_reason.slice(0, 60)}` : ""}
                      </span>
                      <button
                        onClick={() => onStopTask?.(t.task_id)}
                        disabled={stoppingTaskId === t.task_id || !onStopTask}
                        className="shrink-0 rounded-full border border-white/15 bg-white/[0.05] px-2.5 py-0.5 font-medium text-white/70 hover:bg-white/[0.12] disabled:opacity-40"
                      >
                        {stoppingTaskId === t.task_id ? "Stopping…" : "Stop"}
                      </button>
                    </span>
                  </Bar>
                ))}
                {stopTaskError && (
                  <span className="px-0.5 text-[11px] font-light text-amber/90">{stopTaskError}</span>
                )}
              </section>
            )}

            {channels.length > 0 && (
              <section className="mt-[20px] flex flex-col gap-[8px]">
                <span className="px-0.5 text-[12px] font-semibold leading-none text-white">Connected channels</span>
                {channels.map((c) => (
                  <Bar key={c.id} tone="idle">
                    <span className="flex items-center gap-[7px]">
                      {CHANNEL_ICON[c.kind] ? (
                        <Image src={asset(CHANNEL_ICON[c.kind])} alt={c.kind} width={14} height={14} className="shrink-0 rounded-[3px]" />
                      ) : (
                        <span className="h-[6px] w-[6px] shrink-0 rounded-full bg-accent" />
                      )}
                      <span className="truncate text-white/90">{c.label}</span>
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
