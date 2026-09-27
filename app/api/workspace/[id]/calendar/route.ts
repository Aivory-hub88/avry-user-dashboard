/**
 * GET /api/workspace/[id]/calendar?from&to&tz — one room's timeline
 * (ADR-019 P6): its dated tasks, deadline, dated notes and agent turns.
 */
import { NextRequest, NextResponse } from "next/server"
import { workspaceCredential, unauthorized, forbidden } from "@/lib/workspaceAuth"
import { canRead, getDocRole } from "@/lib/workspaceAccess"
import { fileRoom } from "@/lib/workspaceFileRoom"
import { cleanWindow } from "@/lib/timeline"
import { cleanTimeZone, loadTimeline } from "@/lib/timelineStore"

export const runtime = "nodejs"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const cred = workspaceCredential(req)
  if (!cred || cred.kind !== "user") return unauthorized()
  if (!canRead(await getDocRole(cred, id))) return forbidden()
  if (!(await fileRoom(id))) return NextResponse.json({ error: "room not found" }, { status: 404 })
  const sp = req.nextUrl.searchParams
  const { from, to } = cleanWindow(sp.get("from"), sp.get("to"), new Date().toISOString().slice(0, 10))
  try {
    return NextResponse.json(await loadTimeline({ cred, roomId: id, from, to, tz: cleanTimeZone(sp.get("tz")) }))
  } catch (e) {
    console.error("[workspace/[id]/calendar GET]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}
