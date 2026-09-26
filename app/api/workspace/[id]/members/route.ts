/**
 * GET /api/workspace/[id]/members — member Space (rail MEMBERS).
 *
 * Owner + grant manusia (doc_acl + email/nama) + grant agent
 * (workspace_agent_acl). Read gate: siapa pun yang bisa baca doc boleh
 * lihat daftar member (tanpa email bila kosong — samarkan jadi user_id).
 */
import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { getDocRole, canRead, checkAgentAccess } from "@/lib/workspaceAccess"
import { workspaceCredential, unauthorized, forbidden } from "@/lib/workspaceAuth"

export const runtime = "nodejs"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const credential = workspaceCredential(req)
  if (!credential) return unauthorized()
  if (await checkAgentAccess(id, credential, req.headers.get("x-agent-type"), "read"))
    return forbidden()
  if (!canRead(await getDocRole(credential, id))) return forbidden()

  try {
    const doc = await query(
      `SELECT d.owner, d.workspace_id, u.email AS owner_email, u.full_name AS owner_name
       FROM dashboard.workspace_docs d
       LEFT JOIN identity.users u ON u.id = d.owner
       WHERE d.id = $1 LIMIT 1`,
      [`workspace:${id}`],
    )
    const docRow = (doc.rows[0] ?? {}) as Record<string, unknown>
    const grants = await query(
      `SELECT a.user_id, a.role, u.email, u.full_name
       FROM dashboard.workspace_doc_acl a
       LEFT JOIN identity.users u ON u.id = a.user_id
       WHERE a.doc_id = $1 ORDER BY a.created_at`,
      [id],
    )
    // Team rooms (ADR-019): the team's members reach the room through
    // workspace membership, so list them too. The shared 'default'
    // workspace has no members by design.
    const workspaceId = typeof docRow.workspace_id === "string" ? docRow.workspace_id : "default"
    const team =
      workspaceId === "default"
        ? { rows: [] }
        : await query(
            `SELECT m.user_id, m.role, u.email, u.full_name
             FROM dashboard.workspace_members m
             LEFT JOIN identity.users u ON u.id = m.user_id
             WHERE m.workspace_id = $1 ORDER BY m.created_at`,
            [workspaceId],
          )
    const agents = await query(
      `SELECT agent_type, role FROM dashboard.workspace_agent_acl
       WHERE doc_id = $1 ORDER BY agent_type`,
      [id],
    )
    return NextResponse.json({
      owner: docRow.owner
        ? {
            id: String(docRow.owner),
            email: typeof docRow.owner_email === "string" ? docRow.owner_email : null,
            name: typeof docRow.owner_name === "string" ? docRow.owner_name : null,
          }
        : null,
      users: (grants.rows as Record<string, unknown>[]).map((g) => ({
        id: String(g.user_id),
        email: typeof g.email === "string" ? g.email : null,
        name: typeof g.full_name === "string" ? g.full_name : null,
        role: String(g.role),
      })),
      team: (team.rows as Record<string, unknown>[]).map((m) => ({
        id: String(m.user_id),
        email: typeof m.email === "string" ? m.email : null,
        name: typeof m.full_name === "string" ? m.full_name : null,
        role: String(m.role),
      })),
      agents: (agents.rows as Record<string, unknown>[]).map((a) => ({
        type: String(a.agent_type),
        role: String(a.role),
      })),
    })
  } catch (error) {
    console.error("[workspace/members GET]", error)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}
