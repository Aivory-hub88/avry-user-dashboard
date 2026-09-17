/**
 * GET /api/workspace/activity — "What's new for me" lintas Space (Phase 5).
 *
 * ?limit= (default 30, cap 100) ?before= (ISO, halaman lebih lama)
 * ?kinds=mention,here,reply (default semua). Query saat dibaca dari
 * workspace_messages + watermark workspace_read_marks; tanpa fan-out table.
 * Space yang tak bisa dibaca caller dilewati diam-diam (never leak).
 */
import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { getDocRolesBatch, canRead } from "@/lib/workspaceAccess"
import { workspaceCredential, unauthorized } from "@/lib/workspaceAuth"
import {
  ACTIVITY_DEFAULT_LIMIT,
  ACTIVITY_MAX_LIMIT,
  SpaceActivityItemSchema,
  classifyRow,
  rankItems,
  readerOf,
  excerptOf,
  authorNameOf,
  type SpaceActivityItem,
  type SpaceActivityKind,
} from "@/lib/spaceActivity"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const credential = workspaceCredential(req)
  if (!credential) return unauthorized()
  const agentType = req.headers.get("x-agent-type")
  const reader =
    credential.kind === "service"
      ? readerOf("service", undefined, agentType)
      : readerOf("user", credential.user.user_id)
  if (!reader) return NextResponse.json({ error: "agent required (X-Agent-Type)" }, { status: 400 })

  const sp = req.nextUrl.searchParams
  const rawLimit = parseInt(sp.get("limit") ?? "", 10)
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(rawLimit, 1), ACTIVITY_MAX_LIMIT)
    : ACTIVITY_DEFAULT_LIMIT
  const before = sp.get("before")?.slice(0, 64)
  const kinds = new Set(
    (sp.get("kinds") ?? "mention,here,reply").split(",").map((k) => k.trim()),
  )

  try {
    // Thread yang diikuti reader (pernah menulis di sana).
    const part = await query(
      `SELECT DISTINCT thread_root FROM dashboard.workspace_messages
       WHERE thread_root IS NOT NULL AND (
         (author_kind = 'user' AND author_id = $1) OR
         (author_kind = 'agent' AND author_id = $2)
       ) LIMIT 500`,
      [reader.userId ?? "", reader.agentType ?? ""],
    )
    const participantRoots = new Set(
      (part.rows as Record<string, unknown>[]).map((r) => String(r.thread_root)),
    )

    const conds = ["created_at > $1"]
    const values: unknown[] = [new Date(0).toISOString()]
    // Jendela dingin: 200 baris terakhir saja (cap anti-ledakan).
    if (before) {
      conds.push(`created_at < $${values.length + 1}`)
      values.push(before)
    }
    const recent = await query(
      `SELECT id, space_id, thread_root, author_kind, author_id, author_name, agent_type,
              body, mentions, member_ids, here, created_at
       FROM dashboard.workspace_messages
       WHERE ${conds.join(" AND ")}
       ORDER BY created_at DESC LIMIT 200`,
      values,
    )
    const rows = recent.rows as Record<string, unknown>[]
    const spaces = [...new Set(rows.map((r) => String(r.space_id)))]
    const roles = await getDocRolesBatch(credential, spaces)
    const allowed = new Set(spaces.filter((s) => canRead(roles.get(s) ?? null)))

    // Watermark per (space, thread|'').
    const marks = await query(
      `SELECT space_id, thread_root, updated_at FROM dashboard.workspace_read_marks
       WHERE member = $1 AND space_id = ANY($2::text[])`,
      [reader.member, spaces],
    )
    const markOf = new Map<string, string>()
    for (const m of marks.rows as Record<string, unknown>[]) {
      const t = m.updated_at instanceof Date ? m.updated_at.toISOString() : String(m.updated_at ?? "")
      markOf.set(`${String(m.space_id)}|${String(m.thread_root ?? "")}`, t)
    }
    const isUnread = (spaceId: string, threadRoot: string, createdAt: string): boolean => {
      const mark = markOf.get(`${spaceId}|${threadRoot}`) ?? markOf.get(`${spaceId}|`) ?? ""
      return !mark || createdAt > mark
    }

    const items: SpaceActivityItem[] = []
    for (const row of rows) {
      const spaceId = String(row.space_id)
      if (!allowed.has(spaceId)) continue
      const kind = classifyRow(row, reader, participantRoots) as SpaceActivityKind | null
      if (!kind || !kinds.has(kind)) continue
      const threadRoot = typeof row.thread_root === "string" ? row.thread_root : String(row.id)
      const createdAt = row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at ?? "")
      const item = SpaceActivityItemSchema.safeParse({
        kind,
        spaceId,
        threadRoot,
        messageId: String(row.id),
        authorName: authorNameOf(row),
        excerpt: excerptOf(row.body),
        createdAt,
        unread: isUnread(spaceId, threadRoot, createdAt),
      })
      if (item.success) items.push(item.data)
      if (items.length >= limit + 1) break
    }

    const ranked = rankItems(items)
    const page = ranked.slice(0, limit)
    return NextResponse.json({
      items: page,
      truncated: ranked.length > limit,
      unread: page.filter((i) => i.unread).length,
    })
  } catch (error) {
    console.error("[workspace/activity GET]", error)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}

/**
 * POST /api/workspace/activity/read-all — { spaceId?, threadRoot? }.
 * Watermark monotone naik (upsert updated_at = now()). Tanpa spaceId =
 * semua Space yang terlihat = tandai per-Space satu per satu? Tidak:
 * tanpa scope = 400 (eksplisit, anti-sapu-buta).
 */
export async function POST(req: NextRequest) {
  const credential = workspaceCredential(req)
  if (!credential) return unauthorized()
  const agentType = req.headers.get("x-agent-type")
  const reader =
    credential.kind === "service"
      ? readerOf("service", undefined, agentType)
      : readerOf("user", credential.user.user_id)
  if (!reader) return NextResponse.json({ error: "agent required (X-Agent-Type)" }, { status: 400 })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const spaceId = typeof body.spaceId === "string" ? body.spaceId.slice(0, 128) : ""
  if (!spaceId) return NextResponse.json({ error: "spaceId required" }, { status: 400 })
  const threadRoot = typeof body.threadRoot === "string" ? body.threadRoot.slice(0, 128) : ""

  try {
    await query(
      `INSERT INTO dashboard.workspace_read_marks (space_id, member, thread_root, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (space_id, member, thread_root)
       DO UPDATE SET updated_at = now()`,
      [spaceId, reader.member, threadRoot],
    )
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[workspace/activity read-all]", error)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}
