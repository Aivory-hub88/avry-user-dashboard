/**
 * Team Space write helpers — Phase 2.
 *
 * Identitas penulis (SCOPE §5.2 — tidak ada akun bot terpisah):
 * - user → kind user, id = user_id
 * - service + X-Agent-Type → kind agent, id = agent_type, name = first name roster
 * - service tanpa agent (legacy/importer) → kind system, id = service
 *
 * Author-only (PATCH/DELETE): key penulis pesan harus sama dengan key requester.
 */
import type { NextRequest } from "next/server"
import { AGENT_ROSTER, isAgentType } from "@/lib/agentRoster"
import type { WorkspaceCredential } from "@/lib/workspaceAuth"

export interface SpaceRequester {
  kind: "user" | "agent" | "system"
  id: string
  name: string
  agentType?: string
}

export function requesterFrom(req: NextRequest, cred: WorkspaceCredential): SpaceRequester {
  if (cred.kind === "user") {
    return {
      kind: "user",
      id: cred.user.user_id,
      name: cred.user.email ?? cred.user.user_id,
    }
  }
  const asserted = req.headers.get("x-agent-type")
  if (asserted && isAgentType(asserted)) {
    const roster = AGENT_ROSTER.find((a) => a.type === asserted)
    return { kind: "agent", id: asserted, name: roster?.name ?? asserted, agentType: asserted }
  }
  return { kind: "system", id: "service", name: "service" }
}

/** Key untuk perbandingan author-only. */
export function requesterKey(r: Pick<SpaceRequester, "kind" | "id">): string {
  return `${r.kind}:${r.id}`
}

export function authorKeyOf(row: Record<string, unknown>): string {
  return `${typeof row.author_kind === "string" ? row.author_kind : "user"}:${String(row.author_id ?? "")}`
}

export function newId(): string {
  return crypto.randomUUID()
}

export function cleanBody(body: unknown, max = 8000): string | null {
  if (typeof body !== "string") return null
  const t = body.trim()
  if (t.length === 0 || t.length > max) return null
  return body.slice(0, max)
}

export interface MessageAttachment {
  fileId: string
  name: string
  mime: string
  size: number
  /** Small JPEG data URL for image tiles. */
  thumb?: string
}

const MAX_ATTACHMENTS = 10
const MAX_THUMB_CHARS = 120_000

/** Validates the attachments of a message payload: ≤10, well-formed, thumbs only if a small JPEG data URL. */
export function cleanAttachments(raw: unknown): MessageAttachment[] {
  if (!Array.isArray(raw)) return []
  const out: MessageAttachment[] = []
  for (const a of raw.slice(0, MAX_ATTACHMENTS)) {
    if (!a || typeof a !== "object") continue
    const r = a as Record<string, unknown>
    if (typeof r.fileId !== "string" || !r.fileId || r.fileId.length > 128) continue
    if (typeof r.name !== "string" || !r.name) continue
    const thumb =
      typeof r.thumb === "string" && r.thumb.startsWith("data:image/jpeg;base64,") && r.thumb.length <= MAX_THUMB_CHARS ? r.thumb : undefined
    out.push({
      fileId: r.fileId,
      name: r.name.slice(0, 255),
      mime: typeof r.mime === "string" ? r.mime.slice(0, 128) : "",
      size: typeof r.size === "number" && Number.isFinite(r.size) ? r.size : 0,
      ...(thumb ? { thumb } : {}),
    })
  }
  return out
}
