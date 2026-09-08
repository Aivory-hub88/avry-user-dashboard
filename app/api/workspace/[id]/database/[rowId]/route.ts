import { NextRequest, NextResponse } from "next/server"
import * as Y from "yjs"
import { query } from "@/lib/db"
import { workspaceCredential, collabAuthHeaders, unauthorized, forbidden, type WorkspaceCredential } from "@/lib/workspaceAuth"

export const runtime = "nodejs"

const COLLAB_URL = process.env.COLLAB_URL || "http://aivory-collab:3200"

class WorkspaceDenied extends Error {
  status: number
  constructor(status: number) {
    super("denied")
    this.status = status
  }
}

async function loadDoc(id: string, cred: WorkspaceCredential): Promise<Y.Doc> {
  const doc = new Y.Doc()
  try {
    const res = await fetch(`${COLLAB_URL}/api/workspace/${encodeURIComponent(id)}/doc`, {
      headers: collabAuthHeaders(cred),
      signal: AbortSignal.timeout(2000),
    } as RequestInit)
    if (res.status === 401 || res.status === 403) throw new WorkspaceDenied(res.status)
    if (res.ok) {
      const buf = await res.arrayBuffer()
      if (buf.byteLength > 0) Y.applyUpdate(doc, new Uint8Array(buf))
      return doc
    }
  } catch (e) {
    if (e instanceof WorkspaceDenied) throw e
  }
  const r = await query("SELECT yjs_update FROM dashboard.workspace_docs WHERE id = $1", [id])
  if (r.rows.length > 0) Y.applyUpdate(doc, new Uint8Array(r.rows[0].yjs_update as Buffer))
  return doc
}

async function saveDoc(id: string, doc: Y.Doc, cred: WorkspaceCredential) {
  const upd = Buffer.from(Y.encodeStateAsUpdate(doc))
  try {
    const res = await fetch(`${COLLAB_URL}/api/workspace/${encodeURIComponent(id)}/doc`, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream", ...collabAuthHeaders(cred) },
      body: upd as unknown as BodyInit,
      signal: AbortSignal.timeout(2000),
    } as RequestInit)
    // collab enforces RBAC — a viewer write must not leak into pg
    if (res.status === 401 || res.status === 403) throw new WorkspaceDenied(res.status)
  } catch (e) {
    if (e instanceof WorkspaceDenied) throw e
  }
  await query(
    `INSERT INTO dashboard.workspace_docs (id, yjs_update, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (id) DO UPDATE SET yjs_update = EXCLUDED.yjs_update, updated_at = now()`,
    [id, upd],
  )
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; rowId: string }> }) {
  const { id, rowId } = await params
  const cred = workspaceCredential(req)
  if (!cred) return unauthorized()
  let patch: Record<string, unknown>
  try {
    patch = await req.json()
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 })
  }
  const allowed = new Set(["title", "status", "priority", "assignee", "due"])
  for (const k of Object.keys(patch)) if (!allowed.has(k)) delete patch[k]

  try {
    const doc = await loadDoc(id, cred)
    const arr = doc.getArray<Y.Map<unknown>>("database")
    const idx = arr.toArray().findIndex((m) => (m.get("id") as string) === rowId)
    if (idx < 0) return NextResponse.json({ error: "not found" }, { status: 404 })
    const m = arr.get(idx) as Y.Map<unknown>
    doc.transact(() => {
      for (const [k, v] of Object.entries(patch)) m.set(k, v as string)
    })
    await saveDoc(id, doc, cred)
    return NextResponse.json({ id: rowId, patched: patch })
  } catch (e) {
    if (e instanceof WorkspaceDenied) return NextResponse.json({ error: "forbidden" }, { status: e.status })
    console.error("[workspace/database PATCH]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; rowId: string }> }) {
  const { id, rowId } = await params
  const cred = workspaceCredential(req)
  if (!cred) return unauthorized()
  try {
    const doc = await loadDoc(id, cred)
    const arr = doc.getArray<Y.Map<unknown>>("database")
    const idx = arr.toArray().findIndex((m) => (m.get("id") as string) === rowId)
    if (idx < 0) return NextResponse.json({ error: "not found" }, { status: 404 })
    doc.transact(() => arr.delete(idx, 1))
    await saveDoc(id, doc, cred)
    return NextResponse.json({ ok: true, id: rowId })
  } catch (e) {
    if (e instanceof WorkspaceDenied) return NextResponse.json({ error: "forbidden" }, { status: e.status })
    console.error("[workspace/database DELETE]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}