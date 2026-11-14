"use client"

/**
 * First-run screen for an empty CRM: three ways to start (let Lex fill it,
 * import a spreadsheet, try sample data), how the CRM fits together, and the
 * setup checklist. Text lives in span/div only (global `main p/h*` rules).
 */
import { Check, LayoutGrid, Sparkles, Upload } from "lucide-react"
import type { ChecklistItem } from "@/lib/crmOnboarding"
import { MAX_IMPORT_ROWS } from "@/lib/crmOnboarding"

export default function CrmWelcome({
  checklist,
  sampleBusy,
  onConnect,
  onImport,
  onSample,
  onSkip,
  onItem,
}: {
  checklist: ChecklistItem[]
  sampleBusy: boolean
  onConnect: () => void
  onImport: () => void
  onSample: () => void
  onSkip: () => void
  onItem: (key: ChecklistItem["key"]) => void
}) {
  return (
    <div className="mx-auto w-full max-w-[1040px] space-y-10 py-4">
      <div className="max-w-[640px] space-y-3">
        <div className="text-[12px] font-medium uppercase tracking-wide text-white/55">Welcome to CRM</div>
        <div className="text-[30px] font-light leading-tight text-white">Your pipeline, kept up to date by your agents</div>
        <div className="text-[14px] leading-relaxed text-white/60">
          Lex finds and qualifies leads, logs calls and emails, and moves deals forward. You review what it did and close the deals. Pick how you want to start.
        </div>
      </div>

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
        <StartCard
          highlight
          icon={<Sparkles className="h-5 w-5 text-sky-200" />}
          title="Let Lex fill it"
          body="Connect Lex and it adds companies and contacts as it qualifies leads. Every change lands in the activity feed so you can check it."
          action="Connect Lex"
          foot="Takes about 2 minutes"
          onClick={onConnect}
        />
        <StartCard
          icon={<Upload className="h-5 w-5 text-white/80" />}
          title="Import a spreadsheet"
          body="Bring contacts and companies from a CSV, or an export from Google Contacts, HubSpot or Pipedrive. We match the columns for you."
          action="Upload CSV"
          foot={`Up to ${MAX_IMPORT_ROWS} rows at a time`}
          onClick={onImport}
        />
        <StartCard
          icon={<LayoutGrid className="h-5 w-5 text-white/80" />}
          title="Try it with sample data"
          body="Load a few sample companies, people and deals to see how the pipeline, record pages and timeline work. Remove them all with one click."
          action={sampleBusy ? "Loading…" : "Load sample data"}
          disabled={sampleBusy}
          foot='Marked "Sample" everywhere'
          onClick={onSample}
        />
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="min-w-0 flex-[999_1_480px] space-y-5 rounded-2xl border border-line p-6">
          <div className="text-[13px] font-medium text-white/85">How the CRM fits together</div>
          <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
            <Step n="01" title="Companies and people" body="Every person belongs to a company, so one page shows everyone you talk to there." />
            <Step n="02" title="Deals move through stages" body="Drag a deal from Lead to Won. Each stage shows its total so you see the pipeline at a glance." />
            <Step n="03" title="One timeline per record" body="Calls, emails, notes and tasks, from you and your agents, in the order they happened." />
          </div>
        </div>
        <div className="min-w-0 flex-[1_1_280px] rounded-2xl border border-line bg-white/[0.025] p-6">
          <SetupChecklist items={checklist} onItem={onItem} />
        </div>
      </div>

      <div className="text-center">
        <button type="button" onClick={onSkip} className="text-[12px] text-white/45 underline decoration-white/15 underline-offset-4 hover:text-white/80">
          Skip and start with an empty CRM
        </button>
      </div>
    </div>
  )
}

function StartCard({
  icon,
  title,
  body,
  action,
  foot,
  onClick,
  highlight,
  disabled,
}: {
  icon: React.ReactNode
  title: string
  body: string
  action: string
  foot: string
  onClick: () => void
  highlight?: boolean
  disabled?: boolean
}) {
  return (
    <div className={`flex flex-col gap-3.5 rounded-[20px] border p-6 ${highlight ? "border-white/20 bg-white/[0.06]" : "border-line bg-white/[0.025]"}`}>
      <div className="flex items-center justify-between">
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${highlight ? "bg-sky-400/15" : "bg-white/[0.06]"}`}>{icon}</span>
        {highlight && <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-medium text-black">Recommended</span>}
      </div>
      <div className="text-[16px] font-medium text-white">{title}</div>
      <div className="flex-1 text-[13px] leading-relaxed text-white/60">{body}</div>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`min-h-[40px] self-start rounded-full px-[18px] text-[13px] font-medium transition-transform duration-150 active:scale-[0.97] disabled:opacity-50 ${
          highlight ? "bg-white text-black hover:bg-white/90" : "bg-white/[0.08] text-white/90 hover:bg-white/[0.12]"
        }`}
      >
        {action}
      </button>
      <span className="text-[11px] text-white/50">{foot}</span>
    </div>
  )
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] text-white/45">{n}</div>
      <div className="text-[14px] font-medium text-white">{title}</div>
      <div className="text-[12px] leading-relaxed text-white/55">{body}</div>
    </div>
  )
}

export function SetupChecklist({ items, onItem, onHide }: { items: ChecklistItem[]; onItem: (key: ChecklistItem["key"]) => void; onHide?: () => void }) {
  const done = items.filter((i) => i.done).length
  return (
    <div className="space-y-3.5">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-white/85">Get set up</span>
        <span className="text-[12px] text-white/55">
          {done} of {items.length}
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-white/[0.08]">
        <div className="h-full rounded-full bg-white transition-[width] duration-500 ease-out" style={{ width: `${(done / items.length) * 100}%` }} />
      </div>
      <ul className="space-y-0.5">
        {items.map((i) => (
          <li key={i.key}>
            <button
              type="button"
              onClick={() => onItem(i.key)}
              disabled={i.done}
              className="flex w-full items-center gap-2.5 rounded-lg px-1 py-2 text-left text-[13px] text-white/85 transition-colors hover:bg-white/[0.04] disabled:hover:bg-transparent"
            >
              {i.done ? (
                <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-emerald-400/20 text-emerald-300">
                  <Check size={11} strokeWidth={3} />
                </span>
              ) : (
                <span className="h-[18px] w-[18px] shrink-0 rounded-full border border-white/30" />
              )}
              <span className={i.done ? "text-white/45 line-through decoration-white/25" : ""}>{i.label}</span>
            </button>
          </li>
        ))}
      </ul>
      {onHide && (
        <button type="button" onClick={onHide} className="text-[11px] text-white/40 hover:text-white/75">
          Hide checklist
        </button>
      )}
    </div>
  )
}
