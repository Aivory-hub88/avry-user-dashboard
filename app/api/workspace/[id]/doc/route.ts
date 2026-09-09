import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { workspaceCredential, collabAuthHeaders, authorizeDocFallback, unauthorized, forbidden } from "@/lib/workspaceAuth"
import { canonicalRoomId, legacyDocId, mergeYjsUpdates } from "@/lib/workspaceDoc"

export const runtime = "nodejs"

const COLLAB_URL = process.env.COLLAB_URL || "http://aivory-collab:3200"

async function collabFetch(id: string, cred: ReturnType<typeof workspaceCredential>, init?: RequestInit): Promise<Response | null> {
  if (!cred) return null
  try {
    const res = await fetch(`${COLLAB_URL}/api/workspace/${encodeURIComponent(id)}/doc`, {
      ...init,
      headers: { ...collabAuthHeaders(cred), ...(init?.headers || {}) },
      // 2s timeout via AbortSignal
      signal: AbortSignal.timeout(2000),
    } as RequestInit)
    return res
  } catch {
    return null
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const cred = workspaceCredential(req)
  if (!cred) return unauthorized()
  // collab first (y-octo) — it enforces per-doc RBAC; forward its verdict
  const collab = await collabFetch(id, cred)
  if (collab) {
    if (collab.status === 401 || collab.status === 403) {
      return NextResponse.json({ error: "forbidden" }, { status: collab.status })
    }
    if (collab.ok) {
      const buf = await collab.arrayBuffer()
      return new NextResponse(buf as unknown as BodyInit, {
        status: 200,
        headers: { "Content-Type": "application/octet-stream", "Cache-Control": "no-store", "X-Source": "collab" },
      })
    }
  }
  // collab down — pg BYTEA fallback, but only for still-authorized callers.
  // Read the canonical room row first, then merge the legacy bare-id snapshot
  // so a fallback read never serves a partial half of a split-brain doc.
  if (!(await authorizeDocFallback(cred, id))) return forbidden()
  try {
    const r = await query("SELECT id, yjs_update FROM dashboard.workspace_docs WHERE id = $1 OR id = $2", [
      canonicalRoomId(id),
      legacyDocId(id),
    ])
    if (r.rows.length === 0) return new NextResponse(null, { status: 404 })
    const byId = new Map<string, Buffer>(r.rows.map((row) => [row.id as string, row.yjs_update as Buffer]))
    const merged = mergeYjsUpdates([byId.get(canonicalRoomId(id)) ?? null, byId.get(legacyDocId(id)) ?? null])
    if (!merged) return new NextResponse(null, { status: 404 })
    return new NextResponse(merged as unknown as BodyInit, {
      status: 200,
      headers: { "Content-Type": "application/octet-stream", "Cache-Control": "no-store", "X-Source": "pg" },
    })
  } catch (e) {
    console.error("[workspace/doc GET]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const buf = await req.arrayBuffer()
  if (!buf.byteLength) return NextResponse.json({ error: "empty" }, { status: 400 })
  const cred = workspaceCredential(req)
  if (!cred) return unauthorized()
  const upd = Buffer.from(buf)
  const agentType = req.headers.get("x-agent-type") || req.headers.get("X-Agent-Type") || "user"

  // proxy to collab (y-octo) — it enforces RBAC + rejects viewer writes
  const collabRes = await collabFetch(id, cred, {
    method: "PUT",
    headers: { "Content-Type": "application/octet-stream", "X-Agent-Type": agentType },
    body: buf as unknown as BodyInit,
  })
  if (collabRes && (collabRes.status === 401 || collabRes.status === 403)) {
    return NextResponse.json({ error: "forbidden" }, { status: collabRes.status })
  }
  // collab down — pg fallback write is still gated (never a bypass)
  if (!collabRes?.ok && !(await authorizeDocFallback(cred, id))) {
    return forbidden()
  }

  try {
    await query(
      `INSERT INTO dashboard.workspace_docs (id, yjs_update, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (id) DO UPDATE SET yjs_update = EXCLUDED.yjs_update, updated_at = now()`,
      [id, upd],
    )
    // Best-effort history snapshot (throttled: at most one per minute, deduped by size)
    try {
      const last = await query(`SELECT octet_length(yjs_update) as bytes, created_at FROM dashboard.workspace_doc_history WHERE doc_id = $1 ORDER BY created_at DESC LIMIT 1`, [id])
      const lastBytes = last.rows[0] ? Number(last.rows[0].bytes) : -1
      const lastAt = last.rows[0]?.created_at ? new Date(last.rows[0].created_at as string).getTime() : 0
      const nowMs = Date.now()
      if (upd.length !== lastBytes && nowMs - lastAt > 60_000) {
        const actorId = cred?.kind === 'user' ? cred.user.user_id : 'service'
        await query(`INSERT INTO dashboard.workspace_doc_history (doc_id, yjs_update, actor_id) VALUES ($1,$2,$3)`, [id, upd, actorId])
      }
    } catch {}
  } catch (e) {
    console.error("[workspace/doc PUT pg]", e)
    // if collab succeeded, still return success even if pg fails
    if (collabRes?.ok) {
      return NextResponse.json({ id, updated_at: new Date().toISOString(), bytes: buf.byteLength, source: "collab" })
    }
    return NextResponse.json({ error: "db" }, { status: 500 })
  }

  if (collabRes?.ok) {
    return NextResponse.json({ id, updated_at: new Date().toISOString(), bytes: buf.byteLength, source: "collab+pg", agentType })
  }
  return NextResponse.json({ id, updated_at: new Date().toISOString(), bytes: buf.byteLength, source: "pg", agentType })
}