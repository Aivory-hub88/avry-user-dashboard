/**
 * GET /api/workspace/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD&tz=Area/City
 * The project timeline across every room the caller reaches (ADR-019 P6),
 * plus their project requests still waiting for approval. Window ≤ 120 days.
 */
import { NextRequest, NextResponse } from "next/server"
import { workspaceCredential, unauthorized } from "@/lib/workspaceAuth"
import { cleanWindow } from "@/lib/timeline"
import { cleanTimeZone, loadTimeline } from "@/lib/timelineStore"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const cred = workspaceCredential(req)
  if (!cred || cred.kind !== "user") return unauthorized()
  const sp = req.nextUrl.searchParams
  const { from, to } = cleanWindow(sp.get("from"), sp.get("to"), new Date().toISOString().slice(0, 10))
  try {
    return NextResponse.json(await loadTimeline({ cred, roomId: null, from, to, tz: cleanTimeZone(sp.get("tz")) }))
  } catch (e) {
    console.error("[workspace/calendar GET]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}
