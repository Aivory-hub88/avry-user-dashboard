/**
 * /api/workspace/requests — project requests (ADR-019 P1).
 *
 * GET ?scope=mine   → the caller's own requests (all teams)
 * GET ?scope=inbox  → requests of teams the caller owns (submitted first)
 * POST { workspaceId, title, ... } → new draft (team owner or editor)
 */
import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { workspaceCredential, unauthorized, forbidden } from "@/lib/workspaceAuth"
import { teamRole, LEGACY_WORKSPACE } from "@/lib/teams"
import { cleanRequestInput, requestFromRow } from "@/lib/projectRequests"
import { newId } from "@/lib/spaceWrite"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const cred = workspaceCredential(req)
  if (!cred || cred.kind !== "user") return unauthorized()
  const userId = cred.user.user_id
  const scope = req.nextUrl.searchParams.get("scope") === "inbox" ? "inbox" : "mine"
  try {
    const r =
      scope === "mine"
        ? await query(
            `SELECT pr.*, w.name AS team_name FROM dashboard.project_requests pr
             JOIN dashboard.workspaces w ON w.id = pr.workspace_id
             WHERE pr.requested_by = $1 ORDER BY pr.updated_at DESC LIMIT 200`,
            [userId],
          )
        : await query(
            `SELECT pr.*, w.name AS team_name FROM dashboard.project_requests pr
             JOIN dashboard.workspaces w ON w.id = pr.workspace_id
             WHERE pr.status <> 'draft' AND pr.status <> 'withdrawn'
               AND (w.owner = $1 OR EXISTS (
                 SELECT 1 FROM dashboard.workspace_members m
                 WHERE m.workspace_id = pr.workspace_id AND m.user_id = $1 AND m.role = 'owner'))
             ORDER BY (pr.status = 'submitted') DESC, pr.updated_at DESC LIMIT 200`,
            [userId],
          )
    const requests = r.rows.map((row) => ({
      ...requestFromRow(row as Record<string, unknown>),
      teamName: String(row.team_name ?? ""),
    }))
    return NextResponse.json({ scope, requests })
  } catch (e) {
    console.error("[requests GET]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const cred = workspaceCredential(req)
  if (!cred || cred.kind !== "user") return unauthorized()
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : ""
  if (!workspaceId || workspaceId === LEGACY_WORKSPACE)
    return NextResponse.json({ error: "choose a team" }, { status: 400 })
  const role = await teamRole(cred, workspaceId)
  if (role !== "owner" && role !== "editor") return forbidden()

  const v = cleanRequestInput({ title: "Untitled request", ...body })
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  const x = v.value
  const id = newId()
  try {
    const r = await query(
      `INSERT INTO dashboard.project_requests
         (id, workspace_id, title, goal, deadline, priority, requested_by, requested_by_name,
          fields, data_table, members, agents)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12)
       RETURNING *`,
      [
        id,
        workspaceId,
        x.title,
        x.goal ?? "",
        x.deadline ?? null,
        x.priority ?? "Med",
        cred.user.user_id,
        cred.user.email ?? "",
        JSON.stringify(x.fields ?? []),
        JSON.stringify(x.dataTable ?? { columns: [], rows: [] }),
        JSON.stringify(x.members ?? []),
        x.agents ?? [],
      ],
    )
    return NextResponse.json({ request: requestFromRow(r.rows[0] as Record<string, unknown>) }, { status: 201 })
  } catch (e) {
    console.error("[requests POST]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}
