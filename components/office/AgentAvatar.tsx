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
 * keeps the actual Aivory brand mark instead of a portrait — rendered on
 * its own, no tinted circle behind it (on the user's direction: it should
 * read as "just the icon," not another avatar-shaped badge).
 */
import Image from "next/image"
import { asset } from "@/lib/asset"

const CONSOLE_ICON_SRC = "/Aivory_Avatar.svg"

export interface AgentVisual {
  /** A full-bleed circular portrait (own background baked in) — rendered
   *  with object-fit: cover, no tinted backdrop needed. Absent for Aivory
   *  Console, which renders the bare brand mark instead. */
  portraitSrc?: string
}

export const AGENT_VISUALS: Record<string, AgentVisual> = {
  null: {}, // Aivory Console — brand mark, not a portrait
  autonomous: { portraitSrc: "/agents/autonomous.svg" }, // Generalist Agent
  customer_service: { portraitSrc: "/agents/customer_service.svg" }, // Ticket Ops Agent
  leads_qualifier: { portraitSrc: "/agents/leads_qualifier.svg" }, // Leads Qualifier Agent
  finance_invoice_ops: { portraitSrc: "/agents/finance_invoice_ops.svg" }, // Finance & Invoice Ops Agent
  office_assistant: { portraitSrc: "/agents/office_assistant.svg" },
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
    <div className={`flex shrink-0 items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <Image
        src={asset(CONSOLE_ICON_SRC)}
        alt=""
        width={size}
        height={size}
        style={{ width: "82%", height: "82%", objectFit: "contain" }}
      />
    </div>
  )
}
