"use client"
/**
 * One shared definition of "what does this agent look like" — used by the
 * agent column, the rail header, the chat message avatar, and Mission
 * Control, so none of them can drift out of sync with each other.
 *
 * Each of the 5 PREBUILT_AGENTS has its own portrait (dropped into
 * public/agents/ from frontend-nextjs/public/images/Office Agent/, one
 * illustration per agent type — mapping is aesthetic/vibe-based, not
 * derived from anything). Aivory Console isn't a deployable agent, so it
 * keeps the actual Aivory brand mark instead of a portrait, on a tinted
 * circle the same way every agent's badge/accent color already works.
 */
import Image from "next/image"
import { asset } from "@/lib/asset"

const CONSOLE_ICON_SRC = "/Aivory_Avatar.svg"

export interface AgentVisual {
  bg: string
  accent: string
  /** A full-bleed circular portrait (own background baked in) — rendered
   *  with object-fit: cover, no tinted backdrop needed. Absent for Aivory
   *  Console, which renders the brand mark on `bg` instead. */
  portraitSrc?: string
}

export const AGENT_VISUALS: Record<string, AgentVisual> = {
  null: { bg: "#33422f", accent: "#b7cba6" }, // Aivory Console — brand mark, not a portrait
  autonomous: { bg: "#2b3350", accent: "#9aa8d1", portraitSrc: "/agents/autonomous.svg" }, // Generalist Agent
  customer_service: { bg: "#1f3d38", accent: "#7ec9be", portraitSrc: "/agents/customer_service.svg" }, // Ticket Ops Agent
  leads_qualifier: { bg: "#4a3620", accent: "#d9ab6e", portraitSrc: "/agents/leads_qualifier.svg" }, // Leads Qualifier Agent
  finance_invoice_ops: { bg: "#4a2e28", accent: "#cf9a8a", portraitSrc: "/agents/finance_invoice_ops.svg" }, // Finance & Invoice Ops Agent
  office_assistant: { bg: "#2a1636", accent: "#c9a3e0", portraitSrc: "/agents/office_assistant.svg" },
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

  if (v.portraitSrc) {
    return (
      <div
        className={`relative shrink-0 overflow-hidden rounded-full ${className}`}
        style={{ width: size, height: size }}
      >
        <Image src={asset(v.portraitSrc)} alt="" fill sizes={`${size}px`} style={{ objectFit: "cover" }} />
      </div>
    )
  }

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full ${className}`}
      style={{ width: size, height: size, background: v.bg }}
    >
      <Image
        src={asset(CONSOLE_ICON_SRC)}
        alt=""
        width={size}
        height={size}
        style={{ width: "56%", height: "56%", objectFit: "contain" }}
      />
    </div>
  )
}
