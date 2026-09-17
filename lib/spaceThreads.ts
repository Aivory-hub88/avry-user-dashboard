/**
 * Team Space read store — Phase 1 (baca saja).
 *
 * DB rows (dashboard.workspace_*) → zod SpaceMessage/SpaceTopic.
 * Response divalidasi sebelum dikirim (pola Harbor `reply()`):
 * baris yang gagal validasi di-drop, tidak pernah 500 karena 1 baris buruk.
 */

import {
  SpaceMessageSchema,
  SpaceTopicSchema,
  type SpaceMessage,
  type SpaceTopic,
} from "@/lib/spaceProtocol";

export const STREAM_DEFAULT_LIMIT = 50;
export const STREAM_MAX_LIMIT = 200;
export const THREAD_MAX_REPLIES = 200;

export function clampLimit(raw: unknown, def = STREAM_DEFAULT_LIMIT): number {
  const n = typeof raw === "string" ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(n, 1), STREAM_MAX_LIMIT);
}

/** Baris dashboard.workspace_messages apa adanya dari pg. */
export type SpaceMessageRow = Record<string, unknown>;

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function iso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  return str(v);
}

/** pg row → SpaceMessage tervalidasi, atau null bila baris korup. */
export function spaceMessageFromRow(row: SpaceMessageRow, spaceId: string): SpaceMessage | null {
  const parsed = SpaceMessageSchema.safeParse({
    id: str(row.id),
    spaceId,
    threadRoot: typeof row.thread_root === "string" ? row.thread_root : null,
    author: {
      memberId: str(row.author_id),
      actingMode:
        row.author_kind === "agent" || row.author_kind === "system" ? row.author_kind : "user",
      agentName: typeof row.author_name === "string" ? row.author_name : undefined,
      agentType: typeof row.agent_type === "string" ? row.agent_type : undefined,
    },
    body: str(row.body),
    stamps: {
      agentTypes: strArray(row.mentions),
      memberIds: strArray(row.member_ids),
      here: row.here === true,
      docRefs: strArray(row.doc_refs),
      hasAgent: row.has_agent === true,
    },
    createdAt: iso(row.created_at),
    editedAt: row.edited_at == null ? null : iso(row.edited_at),
    deletedAt: row.deleted_at == null ? null : iso(row.deleted_at),
  });
  return parsed.success ? parsed.data : null;
}

export type SpaceTopicRow = Record<string, unknown>;

/** pg row → SpaceTopic tervalidasi, atau null bila baris korup. */
export function spaceTopicFromRow(row: SpaceTopicRow): SpaceTopic | null {
  const parsed = SpaceTopicSchema.safeParse({
    id: str(row.id),
    threadRoot: str(row.thread_root),
    title: str(row.title),
    archived: row.archived === true,
    docId: typeof row.doc_id === "string" ? row.doc_id : null,
    createdBy: str(row.created_by),
    createdAt: iso(row.created_at),
  });
  return parsed.success ? parsed.data : null;
}

export function replyCountOf(row: SpaceMessageRow): number {
  const n = typeof row.reply_count === "string" ? parseInt(row.reply_count, 10) : row.reply_count;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : 0;
}
