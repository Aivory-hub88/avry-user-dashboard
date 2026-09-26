/**
 * Workspace files (ADR-019 P0) — pure model: validation, object keys, rows.
 *
 * No I/O here so it's unit-testable; lib/r2.ts owns the bucket, the routes
 * own ACL + persistence. Bytes never pass through the dashboard: the browser
 * PUTs straight to R2 with a presigned URL, then /complete verifies it.
 */

export const MAX_FILE_BYTES = 25 * 1024 * 1024

/** Mime allowlist → canonical extension (used when the name has none). */
export const ALLOWED_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/csv": "csv",
  "text/plain": "txt",
  "text/markdown": "md",
  "image/png": "png",
  "image/jpeg": "jpg",
}

export type FileStatus = "pending" | "ready" | "ingested" | "failed"

export interface WorkspaceFile {
  id: string
  roomId: string | null
  requestId: string | null
  name: string
  mime: string
  size: number
  status: FileStatus
  uploadedBy: string
  createdAt: string
}

export type UploadIntent = { name: string; mime: string; size: number }

/** Validate a client's upload declaration. Returns an error string or the clean intent. */
export function validateUploadIntent(input: unknown): { ok: true; intent: UploadIntent } | { ok: false; error: string } {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>
  const name = typeof o.name === "string" ? o.name.trim() : ""
  if (!name) return { ok: false, error: "name required" }
  if (name.length > 255) return { ok: false, error: "name too long (max 255)" }
  const mime = typeof o.mime === "string" ? o.mime.trim().toLowerCase() : ""
  if (!(mime in ALLOWED_MIME)) return { ok: false, error: "file type not allowed" }
  const size = typeof o.size === "number" ? o.size : Number.NaN
  if (!Number.isInteger(size) || size <= 0) return { ok: false, error: "size required" }
  if (size > MAX_FILE_BYTES) return { ok: false, error: "file too large (max 25 MB)" }
  return { ok: true, intent: { name, mime, size } }
}

/**
 * Object-key-safe file name: ASCII letters/digits/._- only, no leading dots,
 * collapsed separators, max 120 chars, and an extension matching the mime
 * when the original had none. The display name stays in the DB row.
 */
export function safeObjectName(name: string, mime: string): string {
  const ext = ALLOWED_MIME[mime] ?? "bin"
  const base = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.\-]+/, "")
    .replace(/[.\-]+$/, "")
    .slice(0, 120)
  const clean = base || "file"
  return /\.[A-Za-z0-9]{1,8}$/.test(clean) ? clean : `${clean}.${ext}`
}

/** Key segments are validated ids, so a crafted doc id can't escape its prefix. */
const SEGMENT_RE = /^[A-Za-z0-9_:-]{1,128}$/

export type FileOwnerKind = "room" | "request"

/** Keys never move: a request's files keep their request/ key after approval. */
export function objectKey(p: {
  workspaceId: string
  kind?: FileOwnerKind
  ownerId: string
  fileId: string
  name: string
  mime: string
}): string {
  for (const seg of [p.workspaceId, p.ownerId, p.fileId]) {
    if (!SEGMENT_RE.test(seg)) throw new Error("invalid key segment")
  }
  return `ws/${p.workspaceId}/${p.kind ?? "room"}/${p.ownerId}/${p.fileId}/${safeObjectName(p.name, p.mime)}`
}

/** RFC 6266 attachment header: ASCII fallback + UTF-8 filename*. */
export function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_")
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`
}

function iso(v: unknown): string {
  if (v instanceof Date) return v.toISOString()
  return typeof v === "string" ? v : ""
}

export function fileFromRow(row: Record<string, unknown>): WorkspaceFile {
  return {
    id: String(row.id ?? ""),
    roomId: typeof row.room_id === "string" ? row.room_id : null,
    requestId: typeof row.request_id === "string" ? row.request_id : null,
    name: String(row.name ?? ""),
    mime: String(row.mime ?? ""),
    size: Number(row.size ?? 0),
    status: (String(row.status ?? "pending") as FileStatus),
    uploadedBy: String(row.uploaded_by ?? ""),
    createdAt: iso(row.created_at),
  }
}
