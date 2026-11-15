/**
 * GET /api/workspace/rooms — the rooms on the caller's Workspace home (ADR-019 P5).
 *
 * Rooms the caller owns, was added to (per-room access) or reaches through
 * team membership, newest activity first, with the last message, the room's
 * agents and how many agent turns wait for approval. Platform admins can
 * open any room by URL but only see their own here — the home is a list of
 * your work, not every customer's.
 *
 * POST /api/workspace/rooms { workspaceId, title, goal?, deadline?, agents? }
 * — a team owner opens a room straight away. Owners are the ones who approve
 * requests, so this files the request and approves it in one step: the room
 * still has its request record (approved, with a note saying so) and gets the
 * same setup as any approved request (agents, kickoff, activity log).
 */
import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { workspaceCredential, unauthorized, workspacePlanDenied, forbidden } from "@/lib/workspaceAuth"
import { ROOMS_VISIBLE_TO_USER, teamRole, LEGACY_WORKSPACE } from "@/lib/teams"
import { cleanRequestInput, requestFromRow } from "@/lib/projectRequests"
import { approveRequest } from "@/lib/projectRequestStore"
import { newId } from "@/lib/spaceWrite"

const DIRECT_NOTE = "Opened directly by a team owner"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const cred = workspaceCredential(req)
  if (!cred || cred.kind !== "user") return unauthorized()
  const planDenied = await workspacePlanDenied(req, cred)
  if (planDenied) return planDenied
  const userId = cred.user.user_id
  try {
    const r = await query(
      `SELECT d.id, d.title, d.workspace_id, w.name AS team_name, d.updated_at,
              d.props->'brief'->>'deadline' AS deadline, d.props->'brief'->>'priority' AS priority,
              lm.created_at AS last_at, lm.body AS last_body, lm.author_kind AS last_kind, lm.author_name AS last_name,
              COALESCE((SELECT array_agg(a.agent_type ORDER BY a.created_at) FROM dashboard.workspace_agent_acl a WHERE a.doc_id = d.id), '{}') AS agents,
              (SELECT count(*)::int FROM dashboard.workspace_agent_tasks t WHERE t.space_id = d.id AND t.status = 'blocked') AS waiting
       FROM dashboard.workspace_docs d
       LEFT JOIN dashboard.workspaces w ON w.id = d.workspace_id
       LEFT JOIN LATERAL (
         SELECT created_at, body, author_kind, author_name FROM dashboard.workspace_messages m
         WHERE m.space_id = d.id AND m.deleted_at IS NULL ORDER BY m.created_at DESC LIMIT 1
       ) lm ON true
       WHERE ${ROOMS_VISIBLE_TO_USER}
       ORDER BY GREATEST(d.updated_at, COALESCE(lm.created_at, d.updated_at)) DESC
       LIMIT 100`,
      [userId],
    )
    const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : typeof v === "string" ? v : null)
    return NextResponse.json({
      rooms: r.rows.map((row) => ({
        id: String(row.id),
        title: String(row.title ?? "Untitled room"),
        teamName: typeof row.team_name === "string" ? row.team_name : "",
        deadline: typeof row.deadline === "string" ? row.deadline : null,
        priority: typeof row.priority === "string" ? row.priority : null,
        updatedAt: iso(row.updated_at),
        last: row.last_at
          ? { at: iso(row.last_at), kind: String(row.last_kind ?? "user"), name: String(row.last_name ?? ""), body: String(row.last_body ?? "").slice(0, 200) }
          : null,
        agents: Array.isArray(row.agents) ? (row.agents as string[]) : [],
        waiting: Number(row.waiting ?? 0),
      })),
    })
  } catch (e) {
    console.error("[workspace/rooms GET]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const cred = workspaceCredential(req)
  if (!cred || cred.kind !== "user") return unauthorized()
  const planDenied = await workspacePlanDenied(req, cred)
  if (planDenied) return planDenied
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : ""
  if (!workspaceId || workspaceId === LEGACY_WORKSPACE) return NextResponse.json({ error: "choose a team" }, { status: 400 })
  const role = await teamRole(cred, workspaceId)
  if (role === "editor") return NextResponse.json({ error: "Only team owners can open a room directly. Send a request instead." }, { status: 403 })
  if (role !== "owner") return forbidden()

  const v = cleanRequestInput({ title: body.title, goal: body.goal, deadline: body.deadline ?? null, agents: body.agents ?? [] })
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  const x = v.value
  if (!x.title || x.title.length < 2) return NextResponse.json({ error: "give the room a name" }, { status: 400 })

  const id = newId()
  const userId = cred.user.user_id
  try {
    const ins = await query(
      `INSERT INTO dashboard.project_requests
         (id, workspace_id, title, goal, deadline, priority, requested_by, requested_by_name,
          fields, data_table, members, agents, status, submitted_at)
       VALUES ($1, $2, $3, $4, $5, 'Med', $6, $7, '[]'::jsonb, $8::jsonb, '[]'::jsonb, $9, 'submitted', now())
       RETURNING *`,
      [id, workspaceId, x.title, x.goal ?? "", x.deadline ?? null, userId, cred.user.email ?? "", JSON.stringify({ columns: [], rows: [] }), x.agents ?? []],
    )
    const request = requestFromRow(ins.rows[0] as Record<string, unknown>)
    let result
    try {
      result = await approveRequest(request, cred, userId, DIRECT_NOTE)
    } catch (e) {
      // Don't leave a submitted request behind for a room that never opened.
      await query(`DELETE FROM dashboard.project_requests WHERE id = $1 AND status = 'submitted'`, [id]).catch(() => {})
      throw e
    }
    if (!result) return NextResponse.json({ error: "could not open the room" }, { status: 409 })
    return NextResponse.json({ roomId: result.roomId, requestId: id }, { status: 201 })
  } catch (e) {
    console.error("[rooms POST]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}
