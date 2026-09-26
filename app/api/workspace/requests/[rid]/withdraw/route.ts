/** POST /api/workspace/requests/[rid]/withdraw — requester takes it back (ADR-019 P1). */
import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { workspaceCredential, unauthorized, forbidden } from "@/lib/workspaceAuth"
import { loadRequest, requestAccess } from "@/lib/projectRequestStore"
import { requestFromRow } from "@/lib/projectRequests"

export const runtime = "nodejs"

export async function POST(req: NextRequest, { params }: { params: Promise<{ rid: string }> }) {
  const { rid } = await params
  const cred = workspaceCredential(req)
  if (!cred) return unauthorized()
  try {
    const r = await loadRequest(rid)
    const access = r ? await requestAccess(cred, r) : null
    if (!r || !access) return NextResponse.json({ error: "request not found" }, { status: 404 })
    if (!access.isRequester) return forbidden()
    const u = await query(
      `UPDATE dashboard.project_requests SET status = 'withdrawn', updated_at = now()
       WHERE id = $1 AND status IN ('draft', 'submitted', 'changes_requested') RETURNING *`,
      [rid],
    )
    if (!u.rows[0]) return NextResponse.json({ error: "this request can't be withdrawn now" }, { status: 409 })
    return NextResponse.json({ request: requestFromRow(u.rows[0] as Record<string, unknown>) })
  } catch (e) {
    console.error("[requests withdraw]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}
