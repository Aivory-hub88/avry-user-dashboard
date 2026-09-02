"use client"
/**
 * One card shape for every kind of thing the rail can show — an approval,
 * a missed reply, a status warning. Modeled on an actual macOS/iPadOS
 * Notification Centre screenshot, with one deliberate departure from it:
 *
 * - The card surface is always the same neutral dark, regardless of what
 *   app/kind it's from — colour lives on the icon, never as a tint wash
 *   across the whole card.
 * - **The icon is a bare, coloured glyph — no background swatch at all.**
 *   A solid-colour rounded-square icon (what real macOS notifications use)
 *   is an *app icon* — a specific brand's identity, deliberately eye-
 *   catching because it's the one piece of that app's visual language in
 *   the whole feed. These three notification kinds (approval, activity,
 *   status) aren't different apps; they're the same product's internal
 *   states, shown over and over in a list a user may see often. A solid
 *   amber (or blue) square repeated down that list reads as loud and
 *   cartoonish rather than considered — confirmed live: a first pass at
 *   this (opaque `#d9ab6e` fill, dark glyph, drop shadow) was exactly the
 *   "colourful app icon" treatment, and it looked like a warning sticker,
 *   not a system notification. Dropping the swatch and letting only the
 *   glyph itself carry colour is the more restrained, more frequently-
 *   tolerable choice — the same instinct behind Linear/Notion/Slack's own
 *   notification rows, none of which put a solid-fill icon badge on a
 *   generic status line.
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
  /** Matches Apple's own semantic split, not one catch-all "attention"
   *  color: `error` = something actually failed (a fetch, a decision) —
   *  system red. `warn` = needs a decision or setup, nothing is broken —
   *  system orange. `info` = purely informational — system blue. Values
   *  are Apple's real dark-mode system colors (systemRed/systemOrange/
   *  systemBlue, community-measured — Apple publishes these as adaptive
   *  tokens, not hex), not this app's own amber accent, which read as a
   *  muddy, context-free "everything is the same beige" treatment. */
  tone?: "info" | "warn" | "error"
  badge?: string
  actions?: ReactNode
  onClick?: () => void
}

const ICON_TONE_CLASS: Record<"info" | "warn" | "error", string> = {
  error: "text-[#FF453A]",
  warn: "text-[#FF9F0A]",
  info: "text-[#0A84FF]",
}

const BADGE_TONE_CLASS: Record<"info" | "warn" | "error", string> = {
  error: "bg-[rgba(255,69,58,0.16)] text-[#FF6961]",
  warn: "bg-[rgba(255,159,10,0.16)] text-[#FFB454]",
  info: "bg-[rgba(10,132,255,0.16)] text-[#5AA9FF]",
}

export function NotificationCard({ icon, title, subtitle, meta, tone = "info", badge, actions, onClick }: NotificationCardProps) {
  const iconToneClass = ICON_TONE_CLASS[tone]

  const content = (
    <>
      <div className="flex items-start gap-[11px]">
        <div className={`mt-[1px] grid h-[18px] w-[18px] shrink-0 place-items-center ${iconToneClass}`}>{icon}</div>
        <div className="min-w-0 flex-1">
          {badge && (
            <span className={`mb-1 inline-block rounded-full px-2 py-[2px] text-[9.5px] font-semibold uppercase tracking-wider ${BADGE_TONE_CLASS[tone]}`}>
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
