import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"

export const runtime = "nodejs"

const COLLAB_URL = process.env.COLLAB_URL || "http://aivory-collab:3200"

async function collabFetch(id: string, init?: RequestInit): Promise<Response | null> {
  try {
    const res = await fetch(`${COLLAB_URL}/api/workspace/${encodeURIComponent(id)}/doc`, {
      ...init,
      // 2s timeout via AbortSignal
      signal: AbortSignal.timeout(2000),
    } as RequestInit)
    return res
  } catch {
    return null
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // try collab first (y-octo)
  const collab = await collabFetch(id)
  if (collab && collab.ok) {
    const buf = await collab.arrayBuffer()
    return new NextResponse(buf as unknown as BodyInit, {
      status: 200,
      headers: { "Content-Type": "application/octet-stream", "Cache-Control": "no-store", "X-Source": "collab" },
    })
  }
  // fallback to pg BYTEA
  try {
    const r = await query("SELECT yjs_update FROM dashboard.workspace_docs WHERE id = $1", [id])
    if (r.rows.length === 0) return new NextResponse(null, { status: 404 })
    const upd: Buffer = r.rows[0].yjs_update
    return new NextResponse(upd as unknown as BodyInit, {
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
  const upd = Buffer.from(buf)
  const agentType = req.headers.get("x-agent-type") || req.headers.get("X-Agent-Type") || "user"

  // proxy to collab (y-octo) — fire and keep pg as persistence fallback
  const collabRes = await collabFetch(id, {
    method: "PUT",
    headers: { "Content-Type": "application/octet-stream", "X-Agent-Type": agentType },
    body: buf as unknown as BodyInit,
  })

  try {
    await query(
      `INSERT INTO dashboard.workspace_docs (id, yjs_update, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (id) DO UPDATE SET yjs_update = EXCLUDED.yjs_update, updated_at = now()`,
      [id, upd],
    )
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
