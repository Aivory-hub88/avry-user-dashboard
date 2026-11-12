import { ANY_MODULE } from '@/lib/planGate'
import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { normalizeModules } from "@/lib/workspaceModules"
import { workspaceCredential, unauthorized, forbidden, workspacePlanDenied } from "@/lib/workspaceAuth"

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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const { id, userId } = await params
  const cred = workspaceCredential(req)
  if (!cred) return unauthorized()
  const planDenied = await workspacePlanDenied(req, cred, ANY_MODULE)
  if (planDenied) return planDenied
  const actor = cred.kind === "service" ? undefined : cred.user.user_id
  const accountType = cred.kind === "service" ? "superadmin" : cred.user.account_type
  if (!(await isManager(id, accountType, actor))) return forbidden()

  let body: { role?: string; modules?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 })
  }
  const hasRole = body.role !== undefined
  const role = (body.role ?? "").toString()
  if (hasRole && !ROLES.has(role)) return NextResponse.json({ error: "invalid role" }, { status: 400 })
  const hasModules = body.modules !== undefined
  // null resets the member to their role default.
  const modules = body.modules === null ? null : normalizeModules(body.modules)
  if (hasModules && body.modules !== null && modules === null)
    return NextResponse.json({ error: "invalid modules" }, { status: 400 })
  if (!hasRole && !hasModules) return NextResponse.json({ error: "role or modules required" }, { status: 400 })
  // owner can't demote themselves via membership (transfer ownership is out of scope)
  if (hasRole && userId === actor && role !== "owner")
    return NextResponse.json({ error: "cannot demote self" }, { status: 400 })

  try {
    const r = await query(
      `UPDATE dashboard.workspace_members
       SET role = CASE WHEN $4 THEN $1 ELSE role END,
           modules = CASE WHEN $5 THEN $6::text[] ELSE modules END
       WHERE workspace_id = $2 AND user_id = $3
       RETURNING role, modules`,
      [role, id, userId, hasRole, hasModules, modules],
    )
    if ((r.rowCount ?? 0) === 0) return NextResponse.json({ error: "not a member" }, { status: 404 })
    return NextResponse.json({ workspace_id: id, user_id: userId, ...r.rows[0] })
  } catch (e) {
    console.error("[workspaces/members PATCH]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const { id, userId } = await params
  const cred = workspaceCredential(_req)
  if (!cred) return unauthorized()
  const planDenied = await workspacePlanDenied(_req, cred, ANY_MODULE)
  if (planDenied) return planDenied
  const actor = cred.kind === "service" ? undefined : cred.user.user_id
  const accountType = cred.kind === "service" ? "superadmin" : cred.user.account_type
  if (!(await isManager(id, accountType, actor))) return forbidden()
  if (userId === actor) return NextResponse.json({ error: "cannot remove self" }, { status: 400 })

  try {
    await query("DELETE FROM dashboard.workspace_members WHERE workspace_id = $1 AND user_id = $2", [id, userId])
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[workspaces/members DELETE]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}