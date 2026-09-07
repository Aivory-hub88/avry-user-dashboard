import { NextRequest, NextResponse } from "next/server"
import * as Y from "yjs"
import { query } from "@/lib/db"

export const runtime = "nodejs"

async function loadDoc(id: string): Promise<Y.Doc> {
  const doc = new Y.Doc()
  const r = await query("SELECT yjs_update FROM dashboard.workspace_docs WHERE id = $1", [id])
  if (r.rows.length > 0) Y.applyUpdate(doc, new Uint8Array(r.rows[0].yjs_update as Buffer))
  return doc
}

async function saveDoc(id: string, doc: Y.Doc) {
  const upd = Buffer.from(Y.encodeStateAsUpdate(doc))
  await query(
    `INSERT INTO dashboard.workspace_docs (id, yjs_update, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (id) DO UPDATE SET yjs_update = EXCLUDED.yjs_update, updated_at = now()`,
    [id, upd],
  )
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; rowId: string }> }) {
  const { id, rowId } = await params
  let patch: Record<string, unknown>
  try {
    patch = await req.json()
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 })
  }
  const allowed = new Set(["title", "status", "priority", "assignee", "due"])
  for (const k of Object.keys(patch)) if (!allowed.has(k)) delete patch[k]

  try {
    const doc = await loadDoc(id)
    const arr = doc.getArray<Y.Map<unknown>>("database")
    const idx = arr.toArray().findIndex((m) => (m.get("id") as string) === rowId)
    if (idx < 0) return NextResponse.json({ error: "not found" }, { status: 404 })
    const m = arr.get(idx) as Y.Map<unknown>
    doc.transact(() => {
      for (const [k, v] of Object.entries(patch)) m.set(k, v as string)
    })
    await saveDoc(id, doc)
    return NextResponse.json({ id: rowId, patched: patch })
  } catch (e) {
    console.error("[workspace/database PATCH]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}
