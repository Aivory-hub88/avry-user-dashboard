/**
 * Shared building blocks for the office's per-agent surfaces — AgentColumn,
 * AgentRail, and MissionControl each used to carry their own copy of the
 * agent row list, the channel-kind → icon map, and the relative-time
 * formatter. Harmless while they stayed identical, but a real drift risk the
 * moment one needs to change (e.g. adding a channel kind meant updating 2-3
 * files and it was easy to miss one) — the same "three independent copies of
 * the same thing" pattern useAgentApprovals.ts and useAgentDeployments.ts
 * were deliberately built to avoid for their own data. `lastPreview` keeps a
 * `maxLen` param rather than being fully unified, since the column (narrow,
 * one thread per line) and Mission Control (wide grid card) genuinely want
 * different truncation lengths — that difference is now explicit instead of
 * two copies quietly disagreeing.
 */
import { PREBUILT_AGENTS } from "@/lib/agentChat"
import type { ChatSession } from "@/hooks/useChat"

export interface OfficeRow {
  key: string
  type: string | null
  /** First-name identity (Geno, Teo, Lex, Finn, Ofira) — what the Console
   *  top bar and AgentRail header already show, per docs/AGENT-NAMING
   *  (11 Sep 2026). AgentColumn and MissionControl used to show `a.title`
   *  (the long descriptive card title, e.g. "Ticket Ops Agent") instead —
   *  the rollout hadn't reached them, so the same agent read as "Teo" in
   *  the rail header and "Ticket Ops Agent" one column over. */
  title: string
  /** The long descriptive title, kept for search matching (a user typing
   *  "ticket" should still find Teo) and for any surface that wants it. */
  role: string
  enterprise?: boolean
}

export const OFFICE_ROWS: OfficeRow[] = [
  { key: "null", type: null, title: "Aivory Console", role: "Aivory Console" },
  ...PREBUILT_AGENTS.map((a) => ({ key: a.type, type: a.type, title: a.name, role: a.title, enterprise: a.enterprise })),
]

/** Per-agent glow color for the active/interacting ring (AgentColumn,
 *  and anywhere else that wants the same "who's busy" glow) — reuses the
 *  brand color each agent already owns on its Agents-page card header
 *  (public/agent-card-headers/), so the glow never introduces a color
 *  that isn't already "that agent's color" somewhere else in the product. */
export const AGENT_GLOW_COLOR: Record<string, string> = {
  autonomous: "#de1f5b", // Geno — pink card header
  customer_service: "#6962a5", // Teo — purple card header
  leads_qualifier: "#2dafac", // Lex — teal card header
  finance_invoice_ops: "#8faf82", // Finn — green card header
  office_assistant: "#e86936", // Ofira — orange card header
  chief_of_staff: "#d6c2ad", // Aira — Silver card header
}

/** `#rrggbb` -> `rgba(r, g, b, alpha)`, for the glow's box-shadow — a bare
 *  hex can't carry the transparency the pulse keyframe needs. */
export function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

export const CHANNEL_ICON: Record<string, string> = {
  telegram: "/integrations/telegram.svg",
  slack: "/integrations/slack.svg",
  // AgentDeployment.kind also includes 'api' (lib/agentChat.ts) — missing it
  // here silently fell back to a plain uppercase "API" text label instead of
  // an icon, inconsistent with telegram/slack getting a real mark.
  api: "/integrations/icons/http-api.svg",
}

export function relativeTime(ts: number): string {
  const diffMs = Date.now() - ts
  const mins = Math.round(diffMs / 60_000)
  if (mins < 1) return "now"
  if (mins < 60) return `${mins}m`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.round(hours / 24)}d`
}

/** Caps a pending/notification badge at "99+" — the badge chips this feeds
 *  (AgentColumn's rail avatar and thread-row badges, MissionControl's card
 *  badge) are sized in single-digit px padding for a 1-2 digit count; a raw
 *  3+ digit number stretched or clipped the pill instead of wrapping. */
export function formatBadgeCount(n: number): string {
  return n > 99 ? "99+" : String(n)
}

export function lastPreview(
  session: ChatSession | undefined,
  { maxLen, emptyText }: { maxLen: number; emptyText: string },
): string {
  if (!session || session.messages.length === 0) return emptyText
  const last = session.messages[session.messages.length - 1]
  const text = last.content.replace(/\s+/g, " ").trim()
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text || "New chat"
}
