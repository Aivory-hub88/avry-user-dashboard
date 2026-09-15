"use client"
/**
 * One shared definition of "what does this agent look like" — used by the
 * agent column, the rail header, the chat message avatar, and Mission
 * Control, so none of them can drift out of sync with each other.
 *
 * Each deployable agent has its own portrait (dropped into
 * public/agents/ from frontend-nextjs/public/images/Office Agent/, one
 * illustration per agent type — mapping is aesthetic/vibe-based, not
 * derived from anything). Aivory Console isn't a deployable agent, so it
 * keeps the actual Aivory brand mark instead of a portrait — rendered on
 * its own, no tinted circle behind it (on the user's direction: it should
 * read as "just the icon," not another avatar-shaped badge).
 */
import Image from "next/image"
import { asset } from "@/lib/asset"
import type { AgentType } from "@/lib/agentRoster"

const CONSOLE_ICON_SRC = "/Aivory_Avatar.svg"

export interface AgentVisual {
  /** A full-bleed circular portrait (own background baked in) — rendered
   *  with object-fit: cover, no tinted backdrop needed. Absent for Aivory
   *  Console, which renders the bare brand mark instead. */
  portraitSrc?: string
  /** Optional crop anchor for portraits whose source canvas has extra
   * whitespace. CSS object-position keeps the original artwork intact.
   * Use a percentage, not a px offset — with object-fit: cover the crop
   * window scales with the rendered size, so a fixed px value frames
   * differently at a 22px facepile avatar than at a 38px sidebar one. */
  objectPosition?: string
}

// Portrait asset paths, one per agent type (aesthetic/vibe-based mapping,
// not derived from anything in lib/agentRoster.ts) — plus "null" for Aivory
// Console, which isn't a deployable agent and has no roster entry.
export const AGENT_VISUALS: Record<AgentType | "null", AgentVisual> = {
  null: {}, // Aivory Console — brand mark, not a portrait
  autonomous: { portraitSrc: "/agents/autonomous.svg" }, // Generalist Agent
  customer_service: { portraitSrc: "/agents/customer_service.svg" }, // Ticket Ops Agent
  leads_qualifier: { portraitSrc: "/agents/leads_qualifier.svg" }, // Leads Qualifier Agent
  finance_invoice_ops: { portraitSrc: "/agents/finance_invoice_ops.svg" }, // Finance & Invoice Ops Agent
  office_assistant: { portraitSrc: "/agents/office_assistant.svg" },
  chief_of_staff: { portraitSrc: "/agents/chief_of_staff.svg", objectPosition: "50% 22%" },
}

export function getAgentVisual(type: string | null | undefined): AgentVisual {
  return AGENT_VISUALS[(type ?? "null") as AgentType | "null"] ?? AGENT_VISUALS.autonomous
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
        <Image
          src={asset(v.portraitSrc)}
          alt=""
          fill
          sizes={`${size}px`}
          style={{ objectFit: "cover", objectPosition: v.objectPosition ?? "50% 50%" }}
        />
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
