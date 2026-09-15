"use client"
/**
 * Full Mission Timeline board — Phase 3C.
 *
 * Lives under /console/missions so demo accounts inherit the `console`
 * module grant (see lib/moduleAccess.ts) with no new module key, no backend
 * VALID_MODULE_KEYS sync, and no sidebar entry. Reached via MissionControl's
 * "Open board" link.
 */
import Link from "next/link"
import MissionTimeline from "@/components/office/MissionTimeline"

export default function ConsoleMissionsPage() {
  return (
    <div className="flex-1 overflow-y-auto px-8 py-10">
      <div className="mx-auto max-w-[1200px]">
        <Link
          href="/console"
          className="text-[12px] font-light text-white/40 underline decoration-white/20 underline-offset-2 hover:text-white/70"
        >
          ← Back to Console
        </Link>
        <div
          className="mt-2 font-light text-[28px] leading-tight text-white/90"
          style={{ fontFamily: "var(--font-manrope), sans-serif", fontWeight: 300, letterSpacing: "-0.02em" }}
        >
          Mission Timeline
        </div>
        <div className="mb-8 text-[13px] font-light text-white/40">
          Every Aira orchestration and its specialist steps — read-only, status moves via approvals in Console.
        </div>
        <MissionTimeline variant="full" />
      </div>
    </div>
  )
}
