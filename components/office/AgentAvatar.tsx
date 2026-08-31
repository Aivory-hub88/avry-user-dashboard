"use client"
/**
 * One shared definition of "what does this agent look like" — used by the
 * agent column, the rail header, and the chat message avatar, so the three
 * can't drift out of sync with each other.
 *
 * Every agent uses the same mascot artwork (frontend-nextjs/public/images/
 * Office Agent/Office Agent icon.svg, copied into this app's own
 * public/agents/) — there's only one character asset in the repo so far.
 * Agents are told apart by the circle's background color, matching each
 * agent's own accent (the same color used for its badge elsewhere).
 */
import Image from "next/image"
import { asset } from "@/lib/asset"

const MASCOT_SRC = "/agents/office-assistant.svg"

export interface AgentVisual {
  bg: string
  accent: string
}

export const AGENT_VISUALS: Record<string, AgentVisual> = {
  null: { bg: "#33422f", accent: "#b7cba6" }, // Aivory Console
  autonomous: { bg: "#2b3350", accent: "#9aa8d1" }, // Generalist Agent
  customer_service: { bg: "#1f3d38", accent: "#7ec9be" }, // Ticket Ops Agent
  leads_qualifier: { bg: "#4a3620", accent: "#d9ab6e" }, // Leads Qualifier Agent
  finance_invoice_ops: { bg: "#4a2e28", accent: "#cf9a8a" }, // Finance & Invoice Ops Agent
  office_assistant: { bg: "#2a1636", accent: "#c9a3e0" },
}

export function getAgentVisual(type: string | null | undefined): AgentVisual {
  return AGENT_VISUALS[type ?? "null"] ?? AGENT_VISUALS.autonomous
}

interface AgentAvatarProps {
  type: string | null | undefined
  size?: number
  className?: string
}

export function AgentAvatar({ type, size = 32, className = "" }: AgentAvatarProps) {
  const v = getAgentVisual(type)
  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full ${className}`}
      style={{ width: size, height: size, background: v.bg }}
    >
      <Image
        src={asset(MASCOT_SRC)}
        alt=""
        width={size}
        height={size}
        style={{ width: "78%", height: "78%", objectFit: "contain" }}
      />
    </div>
  )
}
