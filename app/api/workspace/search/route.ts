import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { workspaceCredential, authorizeDocFallback, unauthorized } from "@/lib/workspaceAuth"
import { canReadDocId, isKnownAgentType } from "@/lib/workspaceAccess"
import { loadDbDoc, rowsFromDbDoc, WorkspaceDenied } from "@/lib/workspaceDb"

export const runtime = "nodejs"

// Unified workspace search (Fase 4c): doc titles (pg_trgm ranked) + task
// rows decoded from Yjs blobs. Every candidate gated per-doc — private docs
// never leak through search. Bounded: 50 title candidates, 20 docs decoded,
// 200 rows scanned each, 30 results max. Machine-readable on purpose:
// Cerveau workers use this as the retrieval half (see workspace_collab skill).

const MAX_DOC_CANDIDATES = 50
const MAX_DOCS_DECODED = 20
const MAX_ROWS_SCANNED = 200
const MAX_RESULTS = 30

export type SearchHit = {
  kind: "doc" | "row"
  doc_id: string
  doc_title: string
  row_id?: string
  title: string
  snippet: string
  score: number
}

function snippetOf(hay: string, needle: string, radius = 48): string {
  const h = hay.replace(/\s+/g, " ").trim()
  if (!needle) return h.slice(0, 120)
  const i = h.toLowerCase().indexOf(needle.toLowerCase())
  if (i < 0) return h.slice(0, 120)
  const start = Math.max(0, i - radius)
  const end = Math.min(h.length, i + needle.length + radius)
  return (start > 0 ? "…" : "") + h.slice(start, end) + (end < h.length ? "…" : "")
}

export async function GET(req: NextRequest) {
  const cred = workspaceCredential(req)
  if (!cred) return unauthorized()
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100)
  if (q.length < 2) return NextResponse.json({ q, hits: [] })
  const agent = req.headers.get("x-agent-type") ?? undefined
  const assertedAgent = cred.kind === "service" && isKnownAgentType(agent) ? agent : undefined
  const limit = Math.min(30, Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") ?? "30", 10) || 30))

  try {
    // 1. Title candidates, trigram-ranked (ILIKE prefilter + similarity order).
    const like = `%${q.replace(/[%_\\]/g, "\\$&")}%`
    const cand = await query(
      `SELECT id, title FROM dashboard.workspace_docs
       WHERE deleted_at IS NULL AND title ILIKE $1
       ORDER BY similarity(title, $2) DESC, updated_at DESC
       LIMIT $3`,
      [like, q, MAX_DOC_CANDIDATES],
    )
    const titles = new Map<string, string>()
    const bareIds: string[] = []
    for (const row of cand.rows) {
      const raw = row.id as string
      const bare = raw.replace(/^workspace:(room:|db:)?/, "").replace(/^db:/, "")
      if (bare === "room" || titles.has(bare)) continue
      titles.set(bare, (row.title as string) ?? bare)
      bareIds.push(bare)
    }

    // 2. Gate + decode, title hits first.
    const hits: SearchHit[] = []
    const allowPgBase = cred.kind === "service" ? true : null
    let decoded = 0
    for (const [bare, title] of titles) {
      if (!(await canReadDocId(cred, bare, assertedAgent))) continue
      if (title.toLowerCase().includes(q.toLowerCase())) {
        hits.push({ kind: "doc", doc_id: bare, doc_title: title, title, snippet: snippetOf(title, q), score: 2 })
      }
      if (decoded >= MAX_DOCS_DECODED || hits.length >= MAX_RESULTS) break
      try {
        const allowPg = allowPgBase ?? (await authorizeDocFallback(cred, bare))
        const doc = await loadDbDoc(bare, cred, assertedAgent, allowPg)
        decoded++
        const rows = rowsFromDbDoc(doc).slice(0, MAX_ROWS_SCANNED)
        for (const r of rows) {
          if (hits.length >= MAX_RESULTS) break
          const hay = [r.title, r.description, r.assignee, ...r.comments.map((c) => c.text)].join("\n")
          if (!hay.toLowerCase().includes(q.toLowerCase())) continue
          const titleHit = r.title.toLowerCase().includes(q.toLowerCase())
          hits.push({
            kind: "row",
            doc_id: bare,
            doc_title: title,
            row_id: r.id,
            title: r.title || "Untitled",
            snippet: snippetOf(titleHit ? r.title : hay, q),
            score: titleHit ? 1.5 : 1,
          })
        }
      } catch (e) {
        if (e instanceof WorkspaceDenied) continue
        throw e
      }
      if (hits.length >= MAX_RESULTS) break
    }
    hits.sort((a, b) => b.score - a.score)
    return NextResponse.json({ q, hits: hits.slice(0, limit) })
  } catch (e) {
    console.error("[workspace/search GET]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}
