import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"

export const runtime = "nodejs"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const r = await query("SELECT yjs_update FROM dashboard.workspace_docs WHERE id = $1", [id])
    if (r.rows.length === 0) return new NextResponse(null, { status: 404 })
    const upd: Buffer = r.rows[0].yjs_update
    return new NextResponse(upd as unknown as BodyInit, {
      status: 200,
      headers: { "Content-Type": "application/octet-stream", "Cache-Control": "no-store" },
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
  try {
    await query(
      `INSERT INTO dashboard.workspace_docs (id, yjs_update, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (id) DO UPDATE SET yjs_update = EXCLUDED.yjs_update, updated_at = now()`,
      [id, upd],
    )
    return NextResponse.json({ id, updated_at: new Date().toISOString(), bytes: buf.byteLength })
  } catch (e) {
    console.error("[workspace/doc PUT]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}
