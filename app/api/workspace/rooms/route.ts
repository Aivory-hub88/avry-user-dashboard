/**
 * GET /api/workspace/rooms — the rooms on the caller's Workspace home (ADR-019 P5).
 *
 * Rooms the caller owns, was added to (per-room access) or reaches through
 * team membership, newest activity first, with the last message, the room's
 * agents and how many agent turns wait for approval. Platform admins can
 * open any room by URL but only see their own here — the home is a list of
 * your work, not every customer's.
 */
import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { workspaceCredential, unauthorized } from "@/lib/workspaceAuth"
import { ROOMS_VISIBLE_TO_USER } from "@/lib/teams"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const cred = workspaceCredential(req)
  if (!cred || cred.kind !== "user") return unauthorized()
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
