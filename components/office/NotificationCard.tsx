"use client"
/**
 * One card shape for every kind of thing the rail can show — an approval,
 * a missed reply, a status warning. Modeled after macOS's own Notification
 * Center: a single neutral, rounded card (icon, title, secondary line,
 * timestamp), never a different visual language per kind. Emphasis comes
 * from a small badge and left-edge accent, not from resizing or re-tinting
 * the whole card — that's what made the previous design (one oversized
 * gradient-wash approval card next to plain flat status bars) read as
 * mismatched rather than tidy.
 *
 * `notification-card-in` (styles/globals.css) gives each card a quiet
 * one-shot fade + rise on mount — never retriggered while it's on screen,
 * per the "entrances use ease-out, under 300ms" rule.
 */
import type { ReactNode } from "react"

interface NotificationCardProps {
  icon: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  meta?: string
  tone?: "default" | "warn"
  badge?: string
  actions?: ReactNode
  onClick?: () => void
}

export function NotificationCard({ icon, title, subtitle, meta, tone = "default", badge, actions, onClick }: NotificationCardProps) {
  const toneClass =
    tone === "warn"
      ? "border-white/[0.06] border-l-2 border-l-[#d9ab6e] bg-[rgba(217,171,110,0.06)]"
      : "border-white/[0.06] bg-white/[0.035]"

  const content = (
    <>
      <div className="flex items-start gap-[10px]">
        <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/[0.06] text-white/55">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          {badge && (
            <span className="mb-1 inline-block rounded-full bg-[rgba(217,171,110,0.16)] px-2 py-[2px] text-[9.5px] font-semibold uppercase tracking-wider text-[#e8c088]">
              {badge}
            </span>
          )}
          <p className="truncate text-[13px] font-medium leading-[1.3] text-white/85">{title}</p>
          {subtitle && <p className="mt-0.5 line-clamp-2 text-[12px] font-light leading-[1.4] text-white/45">{subtitle}</p>}
        </div>
        {meta && <span className="shrink-0 pt-0.5 text-[10.5px] font-light tabular-nums text-white/30">{meta}</span>}
      </div>
      {actions && <div className="flex items-center gap-3 pl-[38px]">{actions}</div>}
    </>
  )

  if (onClick) {
    return (
      <button
        onClick={onClick}
        className={`notification-card-in flex w-full flex-col gap-2 rounded-xl border px-3.5 py-3 text-left transition-[background-color,transform] duration-150 ease-out hover:bg-white/[0.06] active:scale-[0.99] ${toneClass}`}
      >
        {content}
      </button>
    )
  }

  return (
    <div className={`notification-card-in flex w-full flex-col gap-2 rounded-xl border px-3.5 py-3 ${toneClass}`}>
      {content}
    </div>
  )
}
