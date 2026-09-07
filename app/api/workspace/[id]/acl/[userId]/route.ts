import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { workspaceCredential, unauthorized, forbidden } from "@/lib/workspaceAuth"

export const runtime = "nodejs"

const ROLES = new Set(["editor", "viewer"])

async function canManageDoc(docId: string, accountType?: string, userId?: string): Promise<boolean> {
  if (accountType === "admin" || accountType === "superadmin") return true
  if (!userId) return false
  try {
    const r = await query(
      `SELECT 1 FROM dashboard.workspace_docs WHERE (id = $1 OR id = $2) AND owner = $3`,
      [`workspace:${docId}`, docId, userId],
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
  const actor = cred.kind === "service" ? undefined : cred.user.user_id
  const accountType = cred.kind === "service" ? "superadmin" : cred.user.account_type
  if (!(await canManageDoc(id, accountType, actor))) return forbidden()

  let body: { role?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 })
  }
  const role = (body.role ?? "").toString()
  if (!ROLES.has(role)) return NextResponse.json({ error: "invalid role (editor|viewer)" }, { status: 400 })

  try {
    await query(
      `UPDATE dashboard.workspace_doc_acl SET role = $1 WHERE doc_id = $2 AND user_id = $3`,
      [role, id, userId],
    )
    return NextResponse.json({ doc_id: id, user_id: userId, role })
  } catch (e) {
    console.error("[workspace/acl PATCH]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const { id, userId } = await params
  const cred = workspaceCredential(_req)
  if (!cred) return unauthorized()
  const actor = cred.kind === "service" ? undefined : cred.user.user_id
  const accountType = cred.kind === "service" ? "superadmin" : cred.user.account_type
  if (!(await canManageDoc(id, accountType, actor))) return forbidden()

  try {
    await query("DELETE FROM dashboard.workspace_doc_acl WHERE doc_id = $1 AND user_id = $2", [id, userId])
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[workspace/acl DELETE]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}