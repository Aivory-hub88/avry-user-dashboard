/**
 * Shared Space UI constants — CLIENT-SAFE (no deps).
 *
 * Aturan: tidak ada lagi hex warna / angka layout / interval poll yang
 * tercecer per-file untuk hal yang sama. Satu sumber, satu nama.
 */

/** Compact relative time: 12s, 5m, 3h, 2d. Empty string when unparseable. */
export function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export type ActivityKind = "mention" | "here" | "reply";

/** Badge + NotificationCard tone per activity kind (F5). */
export const KIND_META: Record<ActivityKind, { badge: string; tone: "info" | "warn" | "error" }> = {
  mention: { badge: "Mention", tone: "info" },
  here: { badge: "Here", tone: "info" },
  reply: { badge: "Reply", tone: "info" },
};

/** Poll intervals (MissionControl pattern: cheap query-on-read). */
export const POLL_MS = {
  /** Thread agent tasks — live-ish while working. */
  agentPanel: 5000,
  /** Activity panel — inbox, not a chat. */
  activityPanel: 30000,
  /** Bell — badge count only. */
  bell: 60000,
} as const;

/** Floating menu (mention picker): surface shared with rail dropdowns. */
export const MENU_POPOVER_CLASS =
  "fixed z-50 max-h-[280px] overflow-y-auto rounded-2xl border border-white/10 bg-[#1e1e1c] p-1.5 shadow-2xl";

/** Sticky bottom composer backdrop (covers scrolled stream). */
export const COMPOSER_STICKY_CLASS = "sticky bottom-0 mt-5 bg-[#18181b]/95 pb-2 pt-3 backdrop-blur";

/** Presence ring blends into the page surface. */
export const PRESENCE_RING_CLASS = "border-[#18181b]";

/** Approval actions (konvensi rail console). */
export const APPROVE_CLASS =
  "rounded-full bg-[#b7cba6] px-4 py-1.5 text-[12px] font-semibold text-[#1a1a18] hover:brightness-105 disabled:opacity-50";

export interface MenuRect {
  top: number;
  bottom: number;
  left: number;
}

export interface MenuPlacement {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
}

const MENU_WIDTH = 300;
const MENU_FLIP_PX = 280;
const EDGE = 8;

/**
 * Pure menu placement: open above the anchor when room allows, else below.
 * Testable — no DOM access (caller passes rect + viewport).
 */
export function placeMenu(rect: MenuRect, viewportWidth: number, viewportHeight: number): MenuPlacement {
  const above = rect.top >= MENU_FLIP_PX;
  return {
    left: Math.max(EDGE, Math.min(rect.left, viewportWidth - (MENU_WIDTH + 16))),
    width: Math.min(MENU_WIDTH, viewportWidth - 16),
    ...(above
      ? { bottom: Math.max(EDGE, viewportHeight - rect.top + 4) }
      : { top: Math.min(rect.bottom + 4, viewportHeight - 120) }),
  };
}
