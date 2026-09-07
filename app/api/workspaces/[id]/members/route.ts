import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { workspaceCredential, unauthorized, forbidden } from "@/lib/workspaceAuth"

export const runtime = "nodejs"

const ROLES = new Set(["owner", "editor", "viewer"])

async function isManager(workspaceId: string, accountType?: string, userId?: string): Promise<boolean> {
  if (accountType === "admin" || accountType === "superadmin") return true
  if (!userId) return false
  try {
    const r = await query(
      `SELECT 1 FROM dashboard.workspaces WHERE id = $1 AND owner = $2
       UNION SELECT 1 FROM dashboard.workspace_members WHERE workspace_id = $1 AND user_id = $2 AND role = 'owner'`,
      [workspaceId, userId],
    )
    return (r.rowCount ?? 0) > 0
  } catch {
    return false
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const cred = workspaceCredential(req)
  if (!cred) return unauthorized()
  const userId = cred.kind === "service" ? undefined : cred.user.user_id
  const accountType = cred.kind === "service" ? "superadmin" : cred.user.account_type
  if (!(await isManager(id, accountType, userId))) return forbidden()
  try {
    const r = await query(
      `SELECT m.user_id, m.role, m.created_at, u.email, u.full_name
       FROM dashboard.workspace_members m
       LEFT JOIN identity.users u ON u.id = m.user_id
       WHERE m.workspace_id = $1 ORDER BY m.created_at`,
      [id],
    )
    const ws = await query("SELECT name, owner FROM dashboard.workspaces WHERE id = $1", [id])
    return NextResponse.json({
      workspace: id,
      name: ws.rows[0]?.name ?? id,
      owner: ws.rows[0]?.owner ?? null,
      members: r.rows,
    })
  } catch (e) {
    console.error("[workspaces/members GET]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const cred = workspaceCredential(req)
  if (!cred) return unauthorized()
  const userId = cred.kind === "service" ? undefined : cred.user.user_id
  const accountType = cred.kind === "service" ? "superadmin" : cred.user.account_type
  if (!(await isManager(id, accountType, userId))) return forbidden()

  let body: { email?: string; role?: string; userId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 })
  }
  const role = (body.role ?? "editor").toString()
  if (!ROLES.has(role)) return NextResponse.json({ error: "invalid role" }, { status: 400 })

  let targetId = body.userId?.toString().trim()
  if (!targetId) {
    const email = (body.email ?? "").toString().trim().toLowerCase()
    if (!email) return NextResponse.json({ error: "email or userId required" }, { status: 400 })
    try {
      const r = await query("SELECT id FROM identity.users WHERE lower(email) = $1", [email])
      if (r.rows.length === 0) return NextResponse.json({ error: "user not found" }, { status: 404 })
      targetId = r.rows[0].id as string
    } catch {
      return NextResponse.json({ error: "db" }, { status: 500 })
    }
  }

  try {
    await query(
      `INSERT INTO dashboard.workspace_members (workspace_id, user_id, role, added_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role, added_by = EXCLUDED.added_by`,
      [id, targetId, role, userId ?? "service"],
    )
    return NextResponse.json({ workspace_id: id, user_id: targetId, role })
  } catch (e) {
    console.error("[workspaces/members POST]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}