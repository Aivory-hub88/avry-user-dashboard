"use client"
/**
 * One card shape for every kind of thing the rail can show — an approval,
 * a missed reply, a status warning. Modeled on an actual macOS/iPadOS
 * Notification Centre screenshot (not just general recollection of it):
 *
 * - The card surface is always the same neutral dark, regardless of what
 *   app/kind it's from — colour lives on the app icon, never as a tint
 *   wash across the whole card. (Our first pass got this backwards: a
 *   warn card had its own tinted background + a coloured left border —
 *   removed both, the icon alone now carries the amber tone.)
 * - Icon is a rounded square ("squircle"), not a circle — macOS app icons
 *   are all rounded-rect, and that's part of what reads as "notification"
 *   rather than "avatar."
 * - The icon itself is a **fully opaque, solid-colour fill with a white
 *   (or near-black, for light fills) glyph** — never a low-opacity tint.
 *   Confirmed against Apple's own App Icon guidelines (opaque, no alpha —
 *   developer.apple.com/design/human-interface-guidelines/foundations/
 *   app-icons) and against a real macOS Notification Centre screenshot
 *   (Creative Cloud's gradient mark, Screen Time's solid-purple hourglass —
 *   both fully saturated, neither a tint of the card background). Our
 *   first pass used `rgba(217,171,110,0.18)` — an 18%-opacity wash — which
 *   is exactly backwards and read as washed-out. A soft drop shadow under
 *   the icon (the system adds one automatically on real Apple platforms)
 *   is the other detail that was missing.
 * - Title and the timestamp share one line (title truncates, timestamp
 *   never does); the secondary line sits below, spanning full width.
 * - An actions row (Approve/Deny, etc.) gets a hairline divider above it
 *   and runs full width — macOS's Keep.../Turn Off pair starts flush with
 *   the icon's left edge, not indented under the text column.
 * - Generous corner radius (16px) — macOS notification cards are close to
 *   a squircle themselves.
 *
 * `notification-card-in` (styles/globals.css) gives each card a quiet
 * one-shot fade + rise on mount — never retriggered while it's on screen,
 * per the "entrances use ease-out, under 300ms" rule.
 *
 * Every text node here is a <span>/<div>, never <p>/<h1-6> — this app has
 * a global `main p` / `main h1-h4` prose style (styles/globals.css) that
 * silently overrides Tailwind's own font-size/color/margin on those tags
 * specifically, regardless of the class on the element. See
 * docs/CERVEAU-WORKING-OFFICE-PLANNING.md, Phase 10's bug write-ups.
 */
import type { ReactNode } from "react"

interface NotificationCardProps {
  icon: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  meta?: string
  /** `warn` = solid amber (status issues, approvals — Aivory's existing
   *  "needs attention" colour, same family as the Approve button/badge).
   *  `info` = solid blue (a missed reply — informational, not urgent). */
  tone?: "info" | "warn"
  badge?: string
  actions?: ReactNode
  onClick?: () => void
}

const ICON_TONE_CLASS: Record<"info" | "warn", string> = {
  // Explicit amber, not `bg-accent` — `accent` is this app's sage-green
  // brand color (see styles/globals.css), a different identity from the
  // amber already used for "Needs approval"/warning language throughout
  // this file. #d9ab6e/#e8c088 are that same amber, used verbatim.
  warn: "bg-[#d9ab6e] text-[#2b2318] shadow-[0_2px_5px_rgba(0,0,0,0.35)]",
  info: "bg-[#6f93bd] text-white shadow-[0_2px_5px_rgba(0,0,0,0.35)]",
}

export function NotificationCard({ icon, title, subtitle, meta, tone = "info", badge, actions, onClick }: NotificationCardProps) {
  const iconToneClass = ICON_TONE_CLASS[tone]

  const content = (
    <>
      <div className="flex items-start gap-[11px]">
        <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-[9px] ${iconToneClass}`}>{icon}</div>
        <div className="min-w-0 flex-1">
          {badge && (
            <span className="mb-1 inline-block rounded-full bg-[rgba(217,171,110,0.16)] px-2 py-[2px] text-[9.5px] font-semibold uppercase tracking-wider text-[#e8c088]">
              {badge}
            </span>
          )}
          <div className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold leading-snug text-white/90">{title}</span>
            {meta && <span className="shrink-0 text-[11px] font-light tabular-nums text-white/35">{meta}</span>}
          </div>
          {subtitle && (
            <div className="mt-0.5 line-clamp-2 text-[12.5px] font-normal leading-[1.4] text-white/55">{subtitle}</div>
          )}
        </div>
      </div>
      {actions && <div className="mt-1 flex items-center gap-3 border-t border-white/[0.07] pt-2.5">{actions}</div>}
    </>
  )

  const sharedClass =
    "notification-card-in flex w-full flex-col gap-2 rounded-[16px] border border-white/[0.06] bg-white/[0.035] px-3.5 py-3"

  if (onClick) {
    return (
      <button
        onClick={onClick}
        className={`${sharedClass} text-left transition-[background-color,transform] duration-150 ease-out hover:bg-white/[0.06] active:scale-[0.99]`}
      >
        {content}
      </button>
    )
  }

  return <div className={sharedClass}>{content}</div>
}
