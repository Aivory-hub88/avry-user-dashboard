/**
 * GET /api/workspace/[id]/timeline — a room's chat as one flat, chronological
 * feed (ADR-019 P2, Console-style room).
 *
 * Roots and replies together, oldest → newest, the latest `limit` (default
 * 100, cap 200). Each reply carries a short quote of the message it answers
 * (reply_to, else its thread root for legacy rows) so the feed can show it
 * WhatsApp-style. Plus the room's recent agent tasks
 * (open ones drive the "thinking" rows and inline approval cards).
 *
 * ?after=<ISO> returns only newer messages (tasks are always the full recent
 * set — they change status in place).
 */
import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { getDocRole, canRead, checkAgentAccess } from "@/lib/workspaceAccess"
import { workspaceCredential, unauthorized, forbidden } from "@/lib/workspaceAuth"
import { clampLimit, spaceMessageFromRow } from "@/lib/spaceThreads"
import { spaceAgentTaskFromRow } from "@/lib/spaceAgent"

export const runtime = "nodejs"

const QUOTE_CHARS = 160

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const credential = workspaceCredential(req)
  if (!credential) return unauthorized()
  if (await checkAgentAccess(id, credential, req.headers.get("x-agent-type"), "read")) return forbidden()
  if (!canRead(await getDocRole(credential, id))) return forbidden()

  const sp = req.nextUrl.searchParams
  const limit = clampLimit(sp.get("limit"), 100)
  const after = sp.get("after")?.slice(0, 64) ?? null

  try {
    const msgs = await query(
      `SELECT * FROM (
         SELECT m.*, p.author_kind AS q_kind, p.author_id AS q_id, p.author_name AS q_name, p.agent_type AS q_agent, left(p.body, ${QUOTE_CHARS}) AS q_body
         FROM dashboard.workspace_messages m
         LEFT JOIN dashboard.workspace_messages p ON p.id = COALESCE(m.reply_to, m.thread_root)
         WHERE m.space_id = $1 ${after ? "AND m.created_at > $2" : ""}
         ORDER BY m.created_at DESC
         LIMIT ${limit}
       ) s ORDER BY s.created_at ASC`,
      after ? [id, after] : [id],
    )
    const messages = []
    for (const row of msgs.rows as Record<string, unknown>[]) {
      const m = spaceMessageFromRow(row, id)
      if (!m) continue
      messages.push({
        ...m,
        authorName: typeof row.author_name === "string" ? row.author_name : "",
        replyTo:
          m.threadRoot && typeof row.q_body === "string"
            ? {
                id: typeof row.reply_to === "string" ? row.reply_to : m.threadRoot,
                kind: String(row.q_kind ?? "user"),
                authorId: String(row.q_id ?? ""),
                name: typeof row.q_name === "string" ? row.q_name : "",
                agentType: typeof row.q_agent === "string" ? row.q_agent : null,
                body: row.q_body,
              }
            : null,
      })
    }

    const t = await query(
      `SELECT * FROM dashboard.workspace_agent_tasks
       WHERE space_id = $1 AND (status IN ('todo', 'in_progress', 'blocked') OR updated_at > now() - interval '1 day')
       ORDER BY created_at DESC LIMIT 50`,
      [id],
    )
    const tasks = []
    for (const row of t.rows as Record<string, unknown>[]) {
      const task = spaceAgentTaskFromRow(row)
      if (task) tasks.push(task)
    }

    return NextResponse.json({ messages, tasks, truncated: !after && msgs.rows.length === limit })
  } catch (error) {
    console.error("[workspace/timeline GET]", error)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}
