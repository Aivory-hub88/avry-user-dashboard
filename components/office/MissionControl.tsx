"use client"
/**
 * Middle-column overview shown instead of a thread — one card per agent,
 * answering "what's my whole team doing" before committing to any one of
 * them. See docs/CERVEAU-WORKING-OFFICE-PLANNING.md, Phase 9.
 *
 * Deliberately not a new data source: every field on a card (status,
 * pending count, last message, channels) is already fetched by the parent
 * page for the agent column and rail — this just lays the same props out as
 * a grid. Ringan by construction, not by discipline.
 */
import Image from "next/image"
import { Lock } from "lucide-react"
import { asset } from "@/lib/asset"
import { PREBUILT_AGENTS, type AgentDeployment } from "@/lib/agentChat"
import type { ChatSession } from "@/hooks/useChat"
import { readVerifierFinding, type PendingApproval } from "@/lib/agentApprovals"
import { ThinkingDots } from "@/components/ui/ThinkingDots"
import { AgentAvatar } from "@/components/office/AgentAvatar"
import EmailAssistantWidget from "@/components/office/EmailAssistantWidget"

const CHANNEL_ICON: Record<string, string> = {
  telegram: "/integrations/telegram.svg",
  slack: "/integrations/slack.svg",
}

interface Row {
  key: string
  type: string | null
  title: string
  enterprise?: boolean
}

const ROWS: Row[] = [
  { key: "null", type: null, title: "Aivory Console" },
  ...PREBUILT_AGENTS.map((a) => ({ key: a.type, type: a.type, title: a.title, enterprise: a.enterprise })),
]

function relativeTime(ts: number): string {
  const diffMs = Date.now() - ts
  const mins = Math.round(diffMs / 60_000)
  if (mins < 1) return "now"
  if (mins < 60) return `${mins}m`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.round(hours / 24)}d`
}

function lastPreview(session: ChatSession | undefined): string {
  if (!session || session.messages.length === 0) return "No conversations yet"
  const last = session.messages[session.messages.length - 1]
  const text = last.content.replace(/\s+/g, " ").trim()
  return text.length > 56 ? `${text.slice(0, 56)}…` : text || "New chat"
}

interface MissionControlProps {
  sessionsByAgent: Record<string, ChatSession[]>
  approvalsByAgent: Record<string, PendingApproval[]>
  deployments: AgentDeployment[]
  streamingAgentType: string | null | undefined
  onOpenAgent: (agentType: string | null) => void
}

export default function MissionControl({
  sessionsByAgent,
  approvalsByAgent,
  deployments,
  streamingAgentType,
  onOpenAgent,
}: MissionControlProps) {
  return (
    <div className="flex-1 overflow-y-auto px-8 py-10">
      <div className="mx-auto max-w-[1000px]">
        {/* Not <h1>/<p> — global `main h1`/`main p` styles override
            font-size/color/margin on any heading or paragraph tag here. */}
        <div
          className="mb-1 font-light text-[28px] leading-tight text-white/90"
          style={{ fontFamily: "var(--font-manrope), sans-serif", fontWeight: 300, letterSpacing: "-0.02em" }}
        >
          Mission Control
        </div>
        <div className="mb-8 text-[13px] font-light text-white/40">
          Every agent, at a glance — pick one to open its thread.
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ROWS.map((row) => {
            const threads = sessionsByAgent[row.key] ?? []
            const mostRecent = threads[0]
            const approvals = approvalsByAgent[row.key] ?? []
            const pending = approvals.length
            // ADR-008 Phase 3a: an approval `verifier_brain` flagged is still
            // just one of the pending ones — the count badge already carries
            // "how many". What the glance view was missing is "is any of them
            // worth opening first", so the status line says that instead.
            // Reading it off the approvals already passed in keeps this view's
            // no-new-data-source rule intact.
            const flagged = approvals.some((a) => readVerifierFinding(a)?.verdict === "flag")
            const channels = row.type
              ? [...new Set(deployments.filter((d) => d.agentType === row.type).map((d) => d.kind))]
              : []
            const isThinking = row.type === streamingAgentType
            const status = isThinking
              ? "Thinking…"
              : flagged
                ? "Flagged"
                : pending > 0
                  ? "Needs you"
                  : "Idle"
            const statusColor = pending > 0 ? "text-amber" : isThinking ? "text-white/60" : "text-white/35"

            return (
              <button
                key={row.key}
                onClick={() => onOpenAgent(row.type)}
                className="group flex flex-col gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5 text-left transition-colors hover:border-white/[0.14] hover:bg-white/[0.05]"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-3">
                    {isThinking ? (
                      <div className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full bg-white/[0.06]">
                        <ThinkingDots size={12} dotSize={2} />
                      </div>
                    ) : (
                      <AgentAvatar type={row.type} size={38} />
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-[6px]">
                        <span className="truncate text-[14px] font-medium text-white">{row.title}</span>
                        {row.enterprise && <Lock className="h-[11px] w-[11px] shrink-0 text-amber-warn/90" />}
                      </div>
                      <span className={`text-[11.5px] font-light ${statusColor}`}>{status}</span>
                    </div>
                  </div>
                  {pending > 0 && (
                    <span className="shrink-0 rounded-full bg-amber/15 px-[8px] py-[3px] text-[11px] font-semibold text-amber">
                      {pending}
                    </span>
                  )}
                </div>

                <div className="truncate text-[12.5px] font-light text-white/40">{lastPreview(mostRecent)}</div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-[6px]">
                    {channels.length === 0 ? (
                      <span className="text-[10.5px] font-light text-white/25">Not deployed</span>
                    ) : (
                      channels.map((k) =>
                        CHANNEL_ICON[k] ? (
                          <Image
                            key={k}
                            src={asset(CHANNEL_ICON[k])}
                            alt={k}
                            width={13}
                            height={13}
                            className="rounded-[3px] opacity-70"
                          />
                        ) : (
                          <span key={k} className="text-[10px] uppercase tracking-wider text-white/25">
                            {k}
                          </span>
                        )
                      )
                    )}
                  </div>
                  {mostRecent && (
                    <span className="text-[10.5px] font-light tabular-nums text-white/25">
                      {relativeTime(mostRecent.updatedAt)}
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {/* Aivory Email Assistant — Mission Control push feed */}
        <div className="mt-6">
          <EmailAssistantWidget />
        </div>
      </div>
    </div>
  )
}
