"use client"

/**
 * Workspace onboarding (CRM phase 3 counterpart): the empty-state stepper
 * (team → request → approval → room), a static preview of what a room looks
 * like, and the "How it works" guide that reopens both once rooms exist.
 * Text lives in span/div only (global `main p/h*` rules).
 */
import { useEffect } from "react"
import { Check, CheckSquare, MessageSquare, StickyNote, X } from "lucide-react"
import { AgentAvatar } from "@/components/office/AgentAvatar"
import type { OnboardingStep, StepAction } from "@/lib/workspaceOnboarding"
import { currentStepIndex } from "@/lib/workspaceOnboarding"

/**
 * `onContinue` is passed once rooms exist (a returning user seeing the welcome
 * for the first time, or reopening it): it adds the way through to the rooms.
 */
export function WorkspaceWelcome({ steps, onAction, onContinue }: { steps: OnboardingStep[]; onAction: (a: StepAction) => void; onContinue?: () => void }) {
  const at = currentStepIndex(steps)
  return (
    <div className="space-y-8">
      <div className="max-w-[720px] space-y-3">
        <div className="text-[12px] font-medium uppercase tracking-wide text-white/55">Welcome to Workspace</div>
        <div className="text-[28px] font-light leading-tight text-white [text-wrap:pretty]">One room per project, for your team and its agents</div>
        <div className="max-w-[600px] text-[14px] leading-relaxed text-white/60">
          Every project starts as a request. Once a team owner approves it, a room opens where people and agents chat, split the work into tasks and keep notes.
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 pt-1 text-[12px] text-white/45">
          <span><span className="text-white/75">Rooms</span> your projects</span>
          <span><span className="text-white/75">Requests</span> start or approve work</span>
          <span><span className="text-white/75">Timeline</span> every deadline in one place</span>
          <span><span className="text-white/75">Teams</span> who can request and approve</span>
        </div>
        {onContinue && (
          <div className="pt-3">
            <button
              type="button"
              onClick={onContinue}
              className="min-h-[38px] rounded-full bg-white px-5 text-[13px] font-medium text-black transition-transform duration-150 hover:bg-white/90 active:scale-[0.97]"
            >
              Go to your rooms
            </button>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-line p-5 sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <span className="text-[13px] font-medium text-white/85">Your first room</span>
          <span className="text-[12px] text-white/50">
            {Math.min(at, steps.length)} of {steps.length} done
          </span>
        </div>
        <WorkspaceStepper steps={steps} onAction={onAction} />
      </div>

      <RoomPreview />
    </div>
  )
}

/** `plain` drops progress (all steps numbered, full contrast) for the guide. */
export function WorkspaceStepper({ steps, onAction, plain }: { steps: OnboardingStep[]; onAction?: (a: StepAction) => void; plain?: boolean }) {
  return (
    <ol className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(190px,100%),1fr))]">
      {steps
        .map((s) => (plain ? { ...s, state: "current" as const, status: undefined, action: undefined } : s))
        .map((s, i) => (
        <li
          key={s.key}
          aria-current={s.state === "current" && !plain ? "step" : undefined}
          className={`flex flex-col gap-2.5 rounded-xl border p-4 ${s.state === "current" && !plain ? "border-white/20 bg-white/[0.05]" : "border-line bg-white/[0.015]"}`}
        >
          <div className="flex items-center gap-2.5">
            {s.state === "done" ? (
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-400/20 text-emerald-300">
                <Check size={13} strokeWidth={3} />
              </span>
            ) : (
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] tabular-nums ${
                  s.state === "current" ? "bg-white text-black" : "border border-white/20 text-white/45"
                }`}
              >
                {i + 1}
              </span>
            )}
            <span className={`text-[14px] font-medium ${s.state === "upcoming" ? "text-white/55" : s.state === "done" ? "text-white/60" : "text-white"}`}>{s.title}</span>
          </div>
          <div className={`flex-1 text-[12px] leading-relaxed ${s.state === "upcoming" ? "text-white/35" : "text-white/55"}`}>{s.body}</div>
          {s.state === "current" && s.status && <div className="rounded-lg bg-white/[0.05] px-2.5 py-1.5 text-[12px] leading-snug text-white/75">{s.status}</div>}
          {s.state === "current" && s.action && onAction && (
            <button
              type="button"
              onClick={() => onAction(s.action!.to)}
              className="mt-0.5 min-h-[36px] self-start rounded-full bg-white px-4 text-[12px] font-medium text-black transition-transform duration-150 hover:bg-white/90 active:scale-[0.97]"
            >
              {s.action.label}
            </button>
          )}
        </li>
      ))}
    </ol>
  )
}

/** A static picture of a room so people know what they're working towards. Not real data. */
export function RoomPreview() {
  return (
    <div className="flex flex-wrap gap-4">
      <div className="min-w-0 flex-[1_1_min(260px,100%)] space-y-4 py-1">
        <div className="text-[13px] font-medium text-white/85">What a room looks like</div>
        <Feature icon={<MessageSquare className="h-4 w-4" />} title="Chat" body="Talk to the team and mention an agent to hand it work. Agents ask before doing anything that needs your OK." />
        <Feature icon={<CheckSquare className="h-4 w-4" />} title="Tasks" body="The project split into tasks with owners and dates, for people and agents alike." />
        <Feature icon={<StickyNote className="h-4 w-4" />} title="Notes" body="Briefs, decisions and files the room keeps, so nobody has to scroll back through chat." />
      </div>

      <div aria-hidden className="pointer-events-none min-w-0 flex-[999_1_min(420px,100%)] select-none overflow-hidden rounded-2xl border border-line bg-black/20">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-[13px] text-white/85">Q4 customer report</div>
            <div className="text-[11px] text-white/35">Ops · due 12 Dec</div>
          </div>
          <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/45">Example</span>
        </div>
        <div className="flex gap-1 border-b border-line px-3 text-[12px]">
          <span className="border-b border-white px-2 py-2 text-white">Chat</span>
          <span className="px-2 py-2 text-white/40">Tasks</span>
          <span className="px-2 py-2 text-white/40">Notes</span>
        </div>
        <div className="space-y-3.5 px-4 py-4">
          <Msg who="Dana" body="@Data Analyst can you pull Q4 revenue by region from the sheet I attached?" />
          <Msg agent="data_analyst" who="Data Analyst" body="On it. I found 4 regions and 1,284 orders. Draft chart is in Notes." />
          <div className="ml-9 flex items-center justify-between gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2.5">
            <span className="text-[12px] text-amber-100/90">Office Assistant wants to email the report to 3 people</span>
            <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-black">Approve</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-white/70">{icon}</span>
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-white/90">{title}</div>
        <div className="mt-0.5 text-[12px] leading-relaxed text-white/50">{body}</div>
      </div>
    </div>
  )
}

function Msg({ who, body, agent }: { who: string; body: string; agent?: string }) {
  return (
    <div className="flex gap-2.5">
      {agent ? (
        <AgentAvatar type={agent} size={26} />
      ) : (
        <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-sky-400/20 text-[11px] font-medium text-sky-100">{who[0]}</span>
      )}
      <div className="min-w-0">
        <div className="text-[11px] text-white/45">{who}</div>
        <div className="mt-0.5 text-[13px] leading-relaxed text-white/80">{body}</div>
      </div>
    </div>
  )
}

/** "How it works": the same stepper and preview, reopened from the header once rooms exist. */
export function WorkspaceGuide({ steps, onClose, onTour }: { steps: OnboardingStep[]; onClose: () => void; onTour: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal="true" aria-label="How Workspace works" className="relative flex max-h-[88vh] w-full max-w-[880px] flex-col overflow-hidden rounded-2xl border border-line bg-surface-1 shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <span className="text-[15px] font-medium text-white/90">How Workspace works</span>
          <button type="button" onClick={onClose} aria-label="Close" className="text-white/45 hover:text-white/85">
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-8 overflow-y-auto px-5 py-5">
          <WorkspaceStepper steps={steps} plain />
          <RoomPreview />
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3.5">
          <button type="button" onClick={onTour} className="rounded-full px-4 py-2 text-[12px] text-white/60 hover:bg-white/[0.06] hover:text-white/85">
            Show me around this page
          </button>
          <button type="button" onClick={onClose} className="rounded-full bg-white px-4 py-2 text-[12px] font-medium text-black hover:bg-white/90">
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
