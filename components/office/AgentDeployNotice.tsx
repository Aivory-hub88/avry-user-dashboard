"use client"
/**
 * "This agent isn't deployed anywhere yet" — a slim, full-width announcement
 * bar (same structural pattern as a site-wide notice: one underlined phrase
 * acting as the link, the rest is plain sentence), not a bordered card.
 * Disappears on its own once a channel exists — no dismiss control, so it
 * can't be dismissed-and-forgotten while still true.
 */
import Link from "next/link"

interface AgentDeployNoticeProps {
  agentName: string
}

export default function AgentDeployNotice({ agentName }: AgentDeployNoticeProps) {
  return (
    <div
      role="status"
      className="w-full bg-amber/10 px-6 py-2.5 text-center text-[13px] font-light leading-[1.5] text-white/70 [animation:fadeUp_0.3s_cubic-bezier(0.23,1,0.32,1)_both]"
    >
      <Link href="/agents" className="font-medium text-amber-light underline underline-offset-2 hover:text-amber-light-hover">
        {agentName} isn&apos;t deployed anywhere yet
      </Link>
      {" — connect it to Telegram, Slack, or WhatsApp to reach it outside Console."}
    </div>
  )
}
