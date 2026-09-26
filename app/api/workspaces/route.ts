/**
 * /api/workspaces — team workspaces (ADR-019 P1).
 *
 * GET  → teams the caller owns or belongs to (never the shared 'default').
 * POST { name } → new team; the creator is its owner (the approver of its
 *      project requests). Members are managed via ./[id]/members.
 */
import { NextRequest, NextResponse } from "next/server"
import { withTransaction } from "@/lib/db"
import { workspaceCredential, unauthorized } from "@/lib/workspaceAuth"
import { myTeams, cleanTeamName, MAX_OWNED_TEAMS } from "@/lib/teams"
import { newId } from "@/lib/spaceWrite"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const cred = workspaceCredential(req)
  if (!cred || cred.kind !== "user") return unauthorized()
  try {
    return NextResponse.json({ teams: await myTeams(cred.user.user_id) })
  } catch (e) {
    console.error("[workspaces GET]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const cred = workspaceCredential(req)
  if (!cred || cred.kind !== "user") return unauthorized()
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const name = cleanTeamName(body.name)
  if (!name) return NextResponse.json({ error: "team name must be 2 to 80 characters" }, { status: 400 })
  const userId = cred.user.user_id
  const id = newId()
  try {
    const created = await withTransaction(async (tx) => {
      const owned = await tx(`SELECT count(*)::int AS n FROM dashboard.workspaces WHERE owner = $1`, [userId])
      if (Number(owned.rows[0]?.n ?? 0) >= MAX_OWNED_TEAMS) return false
      await tx(`INSERT INTO dashboard.workspaces (id, name, owner) VALUES ($1, $2, $3)`, [id, name, userId])
      await tx(
        `INSERT INTO dashboard.workspace_members (workspace_id, user_id, role, added_by) VALUES ($1, $2, 'owner', $2)`,
        [id, userId],
      )
      return true
    })
    if (!created)
      return NextResponse.json({ error: `you can own at most ${MAX_OWNED_TEAMS} teams` }, { status: 409 })
    return NextResponse.json({ team: { id, name, owner: userId, role: "owner" } }, { status: 201 })
  } catch (e) {
    console.error("[workspaces POST]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}
