"use client"

import { useState } from "react"
import { Copy, RefreshCw, ThumbsUp, ThumbsDown, Pencil, Reply } from "lucide-react"

interface MessageActionsProps {
  role: "ai" | "user"
  content: string
  onRegenerate?: () => void
  onEdit?: () => void
  /** WhatsApp-style "reply to this bubble" — quotes this message into the
   *  composer so the next turn (and the agent) knows which one it's about. */
  onReply?: () => void
}

export default function MessageActions({ role, content, onRegenerate, onEdit, onReply }: MessageActionsProps) {
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null)

  const aiActions = [
    { id: "reply", icon: Reply, label: "Reply", action: onReply },
    { id: "copy", icon: Copy, label: "Copy", action: () => navigator.clipboard.writeText(content) },
    { id: "regenerate", icon: RefreshCw, label: "Regenerate", action: onRegenerate },
    { id: "thumbsup", icon: ThumbsUp, label: "Good response", action: () => setFeedback(feedback === "up" ? null : "up") },
    { id: "thumbsdown", icon: ThumbsDown, label: "Bad response", action: () => setFeedback(feedback === "down" ? null : "down") },
  ]

  const userActions = [
    { id: "reply", icon: Reply, label: "Reply", action: onReply },
    { id: "edit", icon: Pencil, label: "Edit", action: onEdit },
    { id: "copy", icon: Copy, label: "Copy", action: () => navigator.clipboard.writeText(content) },
  ]

  const actions = role === "ai" ? aiActions : userActions

  return (
    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
      {actions.map((action) => {
        const Icon = action.icon
        return (
          <button
            key={action.id}
            onClick={action.action}
            className={`
              w-7 h-7 flex items-center justify-center rounded-md
              text-white/40 hover:text-white/80 hover:bg-white/[0.08]
              transition-colors duration-150
              ${action.id === "thumbsup" && feedback === "up" ? "text-accent" : ""}
              ${action.id === "thumbsdown" && feedback === "down" ? "text-red-400" : ""}
            `}
            title={action.label}
            aria-label={action.label}
          >
            <Icon className="w-3.5 h-3.5" />
          </button>
        )
      })}
    </div>
  )
}
