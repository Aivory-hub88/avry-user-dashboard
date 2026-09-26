/** POST /api/workspace/requests/[rid]/submit — requester sends it for review (ADR-019 P1). */
import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { workspaceCredential, unauthorized, forbidden } from "@/lib/workspaceAuth"
import { loadRequest, requestAccess } from "@/lib/projectRequestStore"
import { requestFromRow, submitProblems, EDITABLE } from "@/lib/projectRequests"

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
    if (!EDITABLE.has(r.status)) return NextResponse.json({ error: "already submitted" }, { status: 409 })
    const problems = submitProblems(r)
    if (problems.length > 0) return NextResponse.json({ error: "incomplete", problems }, { status: 400 })
    const u = await query(
      `UPDATE dashboard.project_requests SET status = 'submitted', submitted_at = now(), updated_at = now()
       WHERE id = $1 AND status IN ('draft', 'changes_requested') RETURNING *`,
      [rid],
    )
    if (!u.rows[0]) return NextResponse.json({ error: "already submitted" }, { status: 409 })
    return NextResponse.json({ request: requestFromRow(u.rows[0] as Record<string, unknown>) })
  } catch (e) {
    console.error("[requests submit]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}
