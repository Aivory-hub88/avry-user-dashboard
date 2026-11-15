import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { workspaceCredential, unauthorized, forbidden } from "@/lib/workspaceAuth"
import { syncTaskIndexFromStore } from "@/lib/workspaceTaskIndexSync"
import { bareDocId } from "@/lib/workspaceTaskIndex"

export const runtime = "nodejs"

/**
 * POST /api/workspace/tasks/index/backfill — (re)build the "My tasks" index
 * from every stored workspace doc. Service token only (ops, run once after
 * the migration; safe to re-run: each doc's lines are replaced, not added).
 * Docs without task rows produce no lines.
 */
export async function POST(req: NextRequest) {
  const cred = workspaceCredential(req)
  if (!cred) return unauthorized()
  if (cred.kind !== "service") return forbidden()
  try {
    const r = await query(`SELECT id FROM dashboard.workspace_docs WHERE deleted_at IS NULL ORDER BY updated_at DESC`)
    const ids = [...new Set(r.rows.map((row) => bareDocId(row.id as string)).filter(Boolean))]
    let docs = 0
    let tasks = 0
    let failed = 0
    for (const id of ids) {
      try {
        const n = await syncTaskIndexFromStore(id)
        if (n > 0) docs++
        tasks += n
      } catch (e) {
        failed++
        console.error("[workspace/tasks/index/backfill]", id, e)
      }
    }
    return NextResponse.json({ scanned: ids.length, docs, tasks, failed })
  } catch (e) {
    console.error("[workspace/tasks/index/backfill]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}
