/**
 * POST /api/workspace/requests/[rid]/review { decision, note } — team owner (ADR-019 P1).
 * approve → room created (see approveRequest); changes / reject need a note.
 */
import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { workspaceCredential, unauthorized, forbidden } from "@/lib/workspaceAuth"
import { loadRequest, requestAccess, approveRequest } from "@/lib/projectRequestStore"
import { requestFromRow, reviewTransition, LIMITS, type ReviewDecision } from "@/lib/projectRequests"

export const runtime = "nodejs"

const DECISIONS = new Set<ReviewDecision>(["approve", "changes", "reject"])

export async function POST(req: NextRequest, { params }: { params: Promise<{ rid: string }> }) {
  const { rid } = await params
  const cred = workspaceCredential(req)
  if (!cred) return unauthorized()
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const decision = body.decision as ReviewDecision
  if (!DECISIONS.has(decision)) return NextResponse.json({ error: "decision must be approve, changes or reject" }, { status: 400 })
  const note = typeof body.note === "string" ? body.note.trim().slice(0, LIMITS.note) : ""
  if (decision !== "approve" && !note)
    return NextResponse.json({ error: "add a note so the requester knows why" }, { status: 400 })

  try {
    const r = await loadRequest(rid)
    const access = r ? await requestAccess(cred, r) : null
    if (!r || !access) return NextResponse.json({ error: "request not found" }, { status: 404 })
    if (!access.isReviewer) return forbidden()
    const next = reviewTransition(r.status, decision)
    if (!next) return NextResponse.json({ error: "only submitted requests can be reviewed" }, { status: 409 })
    const reviewer = cred.kind === "user" ? cred.user.user_id : "service"

    if (decision === "approve") {
      const result = await approveRequest(r, cred, reviewer, note)
      if (!result) return NextResponse.json({ error: "already reviewed" }, { status: 409 })
      const fresh = await loadRequest(rid)
      return NextResponse.json({ request: fresh, ...result })
    }
    const u = await query(
      `UPDATE dashboard.project_requests
       SET status = $2, reviewer = $3, review_note = $4, reviewed_at = now(), updated_at = now()
       WHERE id = $1 AND status = 'submitted' RETURNING *`,
      [rid, next, reviewer, note],
    )
    if (!u.rows[0]) return NextResponse.json({ error: "already reviewed" }, { status: 409 })
    return NextResponse.json({ request: requestFromRow(u.rows[0] as Record<string, unknown>) })
  } catch (e) {
    console.error("[requests review]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}
