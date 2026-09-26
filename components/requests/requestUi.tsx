"use client"

/**
 * Shared bits for the project request pages (ADR-019 P1): status pill,
 * section frame, buttons. Text lives in span/div only — the dashboard's
 * global `main h1-h4` / `main p` rules would override Tailwind on UI chrome.
 */
import type { ReactNode, ButtonHTMLAttributes } from "react"
import type { RequestStatus } from "@/lib/projectRequests"

export const STATUS_LABEL: Record<RequestStatus, string> = {
  draft: "Draft",
  submitted: "In review",
  changes_requested: "Changes requested",
  approved: "Approved",
  rejected: "Declined",
  withdrawn: "Withdrawn",
}

const STATUS_TONE: Record<RequestStatus, string> = {
  draft: "bg-white/[0.06] text-white/55",
  submitted: "bg-sky-500/15 text-sky-300",
  changes_requested: "bg-amber-500/15 text-amber-300",
  approved: "bg-[#b7cba6]/15 text-[#b7cba6]",
  rejected: "bg-red-500/10 text-red-300",
  withdrawn: "bg-white/[0.04] text-white/35",
}

export function StatusPill({ status }: { status: RequestStatus }) {
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  )
}

export function Section({ title, hint, children, action }: { title: string; hint?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="border-t border-line py-6 first:border-t-0 first:pt-0">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-white/80">{title}</div>
          {hint && <div className="mt-0.5 text-[12px] text-white/35">{hint}</div>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

type Tone = "primary" | "secondary" | "ghost" | "danger"

const TONE: Record<Tone, string> = {
  primary: "bg-white text-black hover:bg-white/90",
  secondary: "border border-line bg-white/[0.04] text-white/75 hover:bg-white/[0.08] hover:text-white",
  ghost: "text-white/50 hover:bg-white/[0.06] hover:text-white/80",
  danger: "text-red-300/80 hover:bg-red-500/10 hover:text-red-200",
}

/** Press feedback (scale 0.97) is the only motion: these are clicked constantly. */
export function Button({ tone = "secondary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone }) {
  return (
    <button
      type="button"
      {...props}
      className={`shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-medium transition-[transform,background-color,color] duration-150 ease-out active:scale-[0.97] disabled:opacity-40 ${TONE[tone]} ${className}`}
    />
  )
}

/** Field chrome only; callers pick the width (w-full, fixed, flex-1). */
export const fieldClass =
  "rounded-xl border border-line bg-white/[0.04] px-3 py-2 text-[13px] text-white/85 outline-none placeholder:text-white/25 focus:border-white/25 focus:bg-white/[0.06] disabled:opacity-60"

export const inputClass = `w-full ${fieldClass}`

export function formatDate(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)
  if (!Number.isFinite(d.getTime())) return ""
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
