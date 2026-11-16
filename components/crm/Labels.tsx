"use client"

/**
 * Label pills and the label editor used on the CRM lists, add forms and record
 * pages. Text lives in span only (the dashboard's global `main p`/`h*` rules
 * would override Tailwind on UI chrome).
 */
import { useId, useState } from "react"
import { X } from "lucide-react"
import { addLabel, labelHue, MAX_LABELS, removeLabel, SUGGESTED_LABELS } from "@/lib/crmLabels"

export function LabelPill({ label, onRemove, active, onClick }: { label: string; onRemove?: () => void; active?: boolean; onClick?: () => void }) {
  const body = (
    <>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: `hsl(${labelHue(label)} 65% 62%)` }} />
      <span className="truncate">{label}</span>
    </>
  )
  const cls = `inline-flex max-w-[160px] items-center gap-1.5 rounded-full py-0.5 pl-2 text-[11px] ${onRemove ? "pr-1" : "pr-2.5"} ${active ? "bg-white/[0.18] text-white" : "bg-white/[0.07] text-white/75"}`
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-pressed={active} className={`${cls} transition-colors ${active ? "" : "hover:bg-white/[0.12]"}`}>
        {body}
      </button>
    )
  }
  return (
    <span className={cls}>
      {body}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remove label ${label}`} className="rounded-full p-0.5 text-white/40 hover:bg-white/10 hover:text-white/90">
          <X size={10} />
        </button>
      )}
    </span>
  )
}

/** Read-only row of pills; shows the first few and a +N for the rest. */
export function LabelList({ labels, max = 3 }: { labels: string[]; max?: number }) {
  if (labels.length === 0) return <span className="text-white/25">—</span>
  return (
    <span className="flex flex-wrap items-center gap-1">
      {labels.slice(0, max).map((l) => (
        <LabelPill key={l} label={l} />
      ))}
      {labels.length > max && <span className="text-[11px] text-white/45" title={labels.slice(max).join(", ")}>+{labels.length - max}</span>}
    </span>
  )
}

/**
 * Chips plus a type-and-Enter input. Existing labels from the account are suggested
 * (falling back to a short starter set), so people reuse "Hot" instead of typing "hot lead" and "Hot".
 */
export function LabelEditor({
  labels,
  known,
  onChange,
  compact,
  placeholder = "Add label",
}: {
  labels: string[]
  known: string[]
  onChange: (next: string[]) => void
  compact?: boolean
  placeholder?: string
}) {
  const [draft, setDraft] = useState("")
  const listId = useId()
  const pool = (known.length ? known : [...SUGGESTED_LABELS]).filter((k) => !labels.some((l) => l.toLowerCase() === k.toLowerCase()))
  const commit = (raw: string) => {
    const next = addLabel(labels, raw)
    if (next !== labels) onChange(next)
    setDraft("")
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {labels.map((l) => (
        <LabelPill key={l} label={l} onRemove={() => onChange(removeLabel(labels, l))} />
      ))}
      {labels.length < MAX_LABELS && (
        <>
          <input
            value={draft}
            onChange={(e) => {
              const v = e.target.value
              // Picking a datalist suggestion or typing a comma commits straight away.
              if (v.endsWith(",")) commit(v.slice(0, -1))
              else setDraft(v)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                commit(draft)
              } else if (e.key === "Backspace" && draft === "" && labels.length) {
                onChange(labels.slice(0, -1))
              }
            }}
            onBlur={() => draft.trim() && commit(draft)}
            list={listId}
            placeholder={placeholder}
            aria-label="Add label"
            maxLength={24}
            className={`min-w-0 bg-transparent text-[12px] text-white/85 outline-none placeholder:text-white/30 ${compact ? "w-[84px]" : "w-[110px]"}`}
          />
          <datalist id={listId}>
            {pool.map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
        </>
      )}
    </div>
  )
}
