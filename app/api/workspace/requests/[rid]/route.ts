/**
 * /api/workspace/requests/[rid] (ADR-019 P1).
 *
 * GET   → the request (requester or team owner) + what the caller may do
 * PATCH → edit content (requester, while draft / changes_requested)
 */
import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { workspaceCredential, unauthorized, forbidden } from "@/lib/workspaceAuth"
import { loadRequest, requestAccess } from "@/lib/projectRequestStore"
import { cleanRequestInput, requestFromRow, EDITABLE, WITHDRAWABLE } from "@/lib/projectRequests"

export const runtime = "nodejs"

type Ctx = { params: Promise<{ rid: string }> }

const notFound = () => NextResponse.json({ error: "request not found" }, { status: 404 })

export async function GET(req: NextRequest, { params }: Ctx) {
  const { rid } = await params
  const cred = workspaceCredential(req)
  if (!cred) return unauthorized()
  try {
    const r = await loadRequest(rid)
    if (!r) return notFound()
    const access = await requestAccess(cred, r)
    if (!access) return notFound()
    const team = await query(`SELECT name FROM dashboard.workspaces WHERE id = $1`, [r.workspaceId])
    return NextResponse.json({
      request: { ...r, teamName: String(team.rows[0]?.name ?? "") },
      can: {
        edit: access.isRequester && EDITABLE.has(r.status),
        submit: access.isRequester && EDITABLE.has(r.status),
        withdraw: access.isRequester && WITHDRAWABLE.has(r.status),
        review: access.isReviewer && r.status === "submitted",
      },
    })
  } catch (e) {
    console.error("[requests GET one]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}

const COLUMNS: Record<string, [string, (v: unknown) => unknown]> = {
  title: ["title", (v) => v],
  goal: ["goal", (v) => v],
  deadline: ["deadline", (v) => v],
  priority: ["priority", (v) => v],
  fields: ["fields", (v) => JSON.stringify(v)],
  dataTable: ["data_table", (v) => JSON.stringify(v)],
  members: ["members", (v) => JSON.stringify(v)],
  agents: ["agents", (v) => v],
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { rid } = await params
  const cred = workspaceCredential(req)
  if (!cred) return unauthorized()
  try {
    const r = await loadRequest(rid)
    if (!r) return notFound()
    const access = await requestAccess(cred, r)
    if (!access) return notFound()
    if (!access.isRequester) return forbidden()
    if (!EDITABLE.has(r.status)) return NextResponse.json({ error: "this request can't be edited now" }, { status: 409 })

    const v = cleanRequestInput(await req.json().catch(() => ({})))
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
    const sets: string[] = []
    const values: unknown[] = [rid]
    for (const [key, value] of Object.entries(v.value)) {
      const col = COLUMNS[key]
      if (!col) continue
      values.push(col[1](value))
      const cast = key === "fields" || key === "dataTable" || key === "members" ? "::jsonb" : ""
      sets.push(`${col[0]} = $${values.length}${cast}`)
    }
    if (sets.length === 0) return NextResponse.json({ request: r })
    const u = await query(
      `UPDATE dashboard.project_requests SET ${sets.join(", ")}, updated_at = now()
       WHERE id = $1 AND status IN ('draft', 'changes_requested') RETURNING *`,
      values,
    )
    if (!u.rows[0]) return NextResponse.json({ error: "this request can't be edited now" }, { status: 409 })
    return NextResponse.json({ request: requestFromRow(u.rows[0] as Record<string, unknown>) })
  } catch (e) {
    console.error("[requests PATCH]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}
