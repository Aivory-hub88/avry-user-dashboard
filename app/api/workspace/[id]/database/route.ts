import { NextRequest, NextResponse } from "next/server"
import * as Y from "yjs"
import { query } from "@/lib/db"
import { workspaceCredential, collabAuthHeaders, authorizeDocFallback, unauthorized, forbidden, type WorkspaceCredential } from "@/lib/workspaceAuth"
import { checkAgentAccess } from "@/lib/workspaceAccess"
import { canonicalRoomId, legacyDocId, mergeYjsUpdates } from "@/lib/workspaceDoc"
import { recordWorkspaceActivity } from "@/lib/workspaceActivity"

export const runtime = "nodejs"

type Row = { id: string; title: string; status: string; priority: "Low" | "Med" | "High"; assignee: string; due: string }

function uid() {
  return Math.random().toString(36).slice(2, 8)
}

const COLLAB_URL = process.env.COLLAB_URL || "http://aivory-collab:3200"

async function collabFetch(id: string, cred: WorkspaceCredential, init?: RequestInit): Promise<Response | null> {
  try {
    const res = await fetch(`${COLLAB_URL}/api/workspace/${encodeURIComponent(id)}/doc`, {
      ...init,
      headers: { ...collabAuthHeaders(cred), ...(init?.headers || {}) },
      signal: AbortSignal.timeout(2000),
    } as RequestInit)
    return res
  } catch {
    return null
  }
}

async function loadDoc(id: string, cred: WorkspaceCredential): Promise<Y.Doc> {
  const doc = new Y.Doc()
  // try collab first (authoritative RBAC)
  const res = await collabFetch(id, cred)
  if (res && (res.status === 401 || res.status === 403)) throw new WorkspaceDenied(res.status)
  if (res?.ok) {
    const buf = await res.arrayBuffer()
    if (buf.byteLength > 0) Y.applyUpdate(doc, new Uint8Array(buf))
    return doc
  }
  // collab down — pg fallback, gated. Merge canonical + legacy rows so the
  // database view never reads a partial half of a split-brain doc.
  if (!(await authorizeDocFallback(cred, id))) throw new WorkspaceDenied(403)
  const r = await query("SELECT id, yjs_update FROM dashboard.workspace_docs WHERE id = $1 OR id = $2", [
    canonicalRoomId(id),
    legacyDocId(id),
  ])
  if (r.rows.length > 0) {
    const byId = new Map<string, Buffer>(r.rows.map((row) => [row.id as string, row.yjs_update as Buffer]))
    const merged = mergeYjsUpdates([byId.get(canonicalRoomId(id)) ?? null, byId.get(legacyDocId(id)) ?? null])
    if (merged) Y.applyUpdate(doc, new Uint8Array(merged))
  }
  return doc
}

class WorkspaceDenied extends Error {
  status: number
  constructor(status: number) {
    super("denied")
    this.status = status
  }
}

async function saveDoc(id: string, doc: Y.Doc, cred: WorkspaceCredential, agentType = "user") {
  const upd = Buffer.from(Y.encodeStateAsUpdate(doc))
  // push to collab (y-octo) — collab enforces RBAC; a 401/403 means a viewer
  // write attempt, which must NOT leak into the pg fallback write.
  try {
    const res = await collabFetch(id, cred, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream", "X-Agent-Type": agentType },
      body: upd as unknown as BodyInit,
    })
    if (res && (res.status === 401 || res.status === 403)) throw new WorkspaceDenied(res.status)
  } catch (e) {
    if (e instanceof WorkspaceDenied) throw e
  }
  await query(
    `INSERT INTO dashboard.workspace_docs (id, yjs_update, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (id) DO UPDATE SET yjs_update = EXCLUDED.yjs_update, updated_at = now()`,
    [id, upd],
  )
}

function rowsFromDoc(doc: Y.Doc): Row[] {
  const arr = doc.getArray<Y.Map<unknown>>("database")
  return arr.toArray().map((m) => ({
    id: (m.get("id") as string) ?? uid(),
    title: (m.get("title") as string) ?? "",
    status: (m.get("status") as string) ?? "Todo",
    priority: (m.get("priority") as Row["priority"]) ?? "Med",
    assignee: (m.get("assignee") as string) ?? "",
    due: (m.get("due") as string) ?? "",
  }))
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const cred = workspaceCredential(req)
  if (!cred) return unauthorized()
  // Agent gate: invited agents read per their grant; revoked/unknown agents 403
  // (also covers the pg-fallback path when collab is down).
  if (await checkAgentAccess(id, cred, req.headers.get("x-agent-type"), 'read')) return forbidden()
  try {
    const doc = await loadDoc(id, cred)
    const rows = rowsFromDoc(doc)
    return NextResponse.json({ id, rows })
  } catch (e) {
    if (e instanceof WorkspaceDenied) return NextResponse.json({ error: "forbidden" }, { status: e.status })
    console.error("[workspace/database GET]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const cred = workspaceCredential(req)
  if (!cred) return unauthorized()
  const assertedAgent = req.headers.get("x-agent-type") || req.headers.get("X-Agent-Type")
  // Agent gate: only invited editor+ agents may write (also covers pg fallback).
  if (await checkAgentAccess(id, cred, assertedAgent, 'write')) return forbidden()
  let body: Partial<Row>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 })
  }
  const title = (body.title ?? "Untitled").toString().slice(0, 200)
  const status = (body.status ?? "Todo").toString()
  const priority = (body.priority as Row["priority"]) ?? "Med"
  const assignee = (body.assignee ?? "").toString().slice(0, 100)
  const due = (body.due ?? "").toString().slice(0, 20)
  const agentType = req.headers.get("x-agent-type") || req.headers.get("X-Agent-Type") || (assignee || "user")

  try {
    const doc = await loadDoc(id, cred)
    const arr = doc.getArray<Y.Map<unknown>>("database")
    const newRow: Row = { id: uid(), title, status, priority, assignee, due }
    const m = new Y.Map<unknown>()
    for (const [k, v] of Object.entries(newRow)) m.set(k, v)
    doc.transact(() => arr.push([m]), agentType)
    await saveDoc(id, doc, cred, agentType)
    await recordWorkspaceActivity({
      docId: id,
      credential: cred,
      agentType,
      action: 'database.row_created',
      summary: `Created task “${title}”`,
      targetType: 'database-row',
      targetId: newRow.id,
      metadata: { status, priority, assignee, due },
    })
    return NextResponse.json({ id: newRow.id, row: newRow, agentType }, { status: 201 })
  } catch (e) {
    if (e instanceof WorkspaceDenied) return NextResponse.json({ error: "forbidden" }, { status: e.status })
    console.error("[workspace/database POST]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}
