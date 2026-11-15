import { NextRequest, NextResponse } from "next/server"
import * as Y from "yjs"
import { workspaceCredential, authorizeDocFallback, unauthorized, forbidden, workspacePlanDenied, type WorkspaceCredential } from "@/lib/workspaceAuth"
import { checkAgentAccess } from "@/lib/workspaceAccess"
import { WorkspaceDenied, loadDbDoc, parseDbRow, type DbRow } from "@/lib/workspaceDb"
import { cleanOwner, personKey, type RowChange } from "@/lib/workspaceDbModel"
import { recordComment, recordRowChanges, recordRowCreated } from "@/lib/workspaceTaskEvents"

export const runtime = "nodejs"

/**
 * POST /api/workspace/[id]/database/[rowId]/events
 *   { kind: "created" }
 *   { kind: "status" | "due", from: string }
 *   { kind: "owner", from: PersonRef | null }
 *   { kind: "comment", commentId: string }
 *
 * The Tasks UI edits rows straight through Yjs, so the server never sees the
 * diff. After a local edit the client reports what it changed; this writes
 * the activity entry and notifies the task's followers. The claim is checked
 * against the stored row (the value must really differ from `from`, the
 * comment must exist, be recent and be the caller's), so a client can't
 * fabricate notices for edits that didn't happen. The Yjs write may still be
 * on its way, so a claim that doesn't match yet is re-checked once.
 */

const RECENT_MS = 10 * 60_000
const RECHECK_MS = 1500

type Body = { kind?: unknown; from?: unknown; commentId?: unknown }

async function loadRow(id: string, rowId: string, cred: WorkspaceCredential, agentType: string, allowPg: boolean): Promise<DbRow | null> {
  const doc = await loadDbDoc(id, cred, agentType, allowPg)
  const m = doc
    .getArray<Y.Map<unknown>>("database")
    .toArray()
    .find((x) => (x.get("id") as string) === rowId)
  return m ? parseDbRow(m) : null
}

function recent(iso: string): boolean {
  const t = Date.parse(iso)
  return Number.isFinite(t) && Date.now() - t < RECENT_MS
}

function selfKeyOf(cred: WorkspaceCredential, agentType: string): string {
  return cred.kind === "user" ? `user:${cred.user.user_id}` : `agent:${agentType}`
}

/** The change the client claims, resolved against the stored row (null = not (yet) true). */
function verify(row: DbRow, body: Body, selfKey: string): RowChange | "created" | { comment: string } | null {
  switch (body.kind) {
    case "created":
      return recent(row.createdAt) ? "created" : null
    case "status": {
      const from = typeof body.from === "string" ? body.from.slice(0, 16) : ""
      return row.status !== from ? { kind: "status", from, to: row.status } : null
    }
    case "due": {
      const from = typeof body.from === "string" ? body.from.slice(0, 20) : ""
      return row.due !== from ? { kind: "due", from, to: row.due } : null
    }
    case "owner": {
      const from = cleanOwner(body.from)
      const fk = from ? personKey(from) : ""
      const nk = row.owner ? personKey(row.owner) : ""
      return fk !== nk ? { kind: "owner", from, to: row.owner } : null
    }
    case "comment": {
      const cid = typeof body.commentId === "string" ? body.commentId.slice(0, 40) : ""
      const c = row.comments.find((x) => x.id === cid)
      if (!c || !recent(c.at)) return null
      if (!c.authorRef || personKey(c.authorRef) !== selfKey) return null
      return { comment: c.id }
    }
    default:
      return null
  }
}

const KINDS = new Set(["created", "status", "due", "owner", "comment"])

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; rowId: string }> }) {
  const { id, rowId } = await params
  const cred = workspaceCredential(req)
  if (!cred) return unauthorized()
  const planDenied = await workspacePlanDenied(req, cred)
  if (planDenied) return planDenied
  const assertedAgent = req.headers.get("x-agent-type") || req.headers.get("X-Agent-Type")
  if (await checkAgentAccess(id, cred, assertedAgent, "write")) return forbidden()
  const agentType = assertedAgent || "user"
  let body: Body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 })
  }
  if (typeof body.kind !== "string" || !KINDS.has(body.kind)) return NextResponse.json({ error: "kind required" }, { status: 400 })
  try {
    const allowPg = cred.kind === "service" ? true : await authorizeDocFallback(cred, id)
    const selfKey = selfKeyOf(cred, agentType)
    let row = await loadRow(id, rowId, cred, agentType, allowPg)
    let claim = row ? verify(row, body, selfKey) : null
    if (!claim) {
      await new Promise((r) => setTimeout(r, RECHECK_MS))
      row = await loadRow(id, rowId, cred, agentType, allowPg)
      claim = row ? verify(row, body, selfKey) : null
    }
    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 })
    if (!claim) return NextResponse.json({ error: "no such change" }, { status: 409 })
    const ctx = { docId: id, rowId, credential: cred, agentType, title: row.title, followers: row.followers }
    if (claim === "created") await recordRowCreated(ctx)
    else if ("comment" in claim) {
      const c = row.comments.find((x) => x.id === claim.comment)
      if (c) await recordComment(ctx, c)
    } else await recordRowChanges(ctx, [claim])
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof WorkspaceDenied) return NextResponse.json({ error: "forbidden" }, { status: e.status })
    console.error("[workspace/database events POST]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}
