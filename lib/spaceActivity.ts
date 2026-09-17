/**
 * "What's new for me" — activity inbox lintas Space (Phase 5, F5).
 *
 * Query saat dibaca (bukan fan-out table, konsisten dengan Harbor):
 * mention langsung > @here > reply di thread yang diikuti.
 * Unread = created_at > watermark workspace_read_marks (monotone naik).
 * DM tidak ada di scope fase ini (SCOPE §4 Later).
 */

import { z } from "zod";

export const SpaceActivityKindSchema = z.enum(["mention", "here", "reply"]);
export type SpaceActivityKind = z.infer<typeof SpaceActivityKindSchema>;

export const SpaceActivityItemSchema = z.object({
  kind: SpaceActivityKindSchema,
  spaceId: z.string().min(1),
  threadRoot: z.string().min(1),
  messageId: z.string().min(1),
  authorName: z.string(),
  excerpt: z.string(),
  createdAt: z.string().min(1),
  unread: z.boolean(),
});
export type SpaceActivityItem = z.infer<typeof SpaceActivityItemSchema>;

export const ACTIVITY_DEFAULT_LIMIT = 30;
export const ACTIVITY_MAX_LIMIT = 100;

/** Urutan ranking: mention > here > reply. */
export const KIND_RANK: Record<SpaceActivityKind, number> = {
  mention: 0,
  here: 1,
  reply: 2,
};

export interface ActivityReader {
  /** workspace_read_marks.member */
  member: string;
  /** user_id untuk match member_ids (null untuk agent). */
  userId: string | null;
  /** agent_type untuk match mentions (null untuk user). */
  agentType: string | null;
}

export function readerOf(credKind: "user" | "service", userId?: string, agentType?: string | null): ActivityReader | null {
  if (credKind === "service") {
    if (!agentType) return null;
    return { member: `agent:${agentType}`, userId: null, agentType };
  }
  if (!userId) return null;
  return { member: `user:${userId}`, userId, agentType: null };
}

export function excerptOf(body: unknown): string {
  return typeof body === "string" ? body.trim().slice(0, 200) : "";
}

export function authorNameOf(row: Record<string, unknown>): string {
  if (row.author_kind === "agent") {
    return typeof row.author_name === "string" && row.author_name
      ? row.author_name
      : String(row.agent_type ?? "Agent");
  }
  return typeof row.author_name === "string" && row.author_name
    ? row.author_name
    : String(row.author_id ?? "Someone");
}

/** Klasifikasikan 1 baris pesan untuk reader ini (null = bukan untuknya). */
export function classifyRow(
  row: Record<string, unknown>,
  reader: ActivityReader,
  participantRoots: Set<string>,
): SpaceActivityKind | null {
  const mentions = Array.isArray(row.mentions) ? row.mentions : [];
  const memberIds = Array.isArray(row.member_ids) ? row.member_ids : [];
  if (reader.agentType && mentions.includes(reader.agentType)) return "mention";
  if (reader.userId && memberIds.includes(reader.userId)) return "mention";
  if (row.here === true) return "here";
  const root = typeof row.thread_root === "string" ? row.thread_root : null;
  if (root && participantRoots.has(root)) return "reply";
  return null;
}

export function rankItems(items: SpaceActivityItem[]): SpaceActivityItem[] {
  return [...items].sort(
    (a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || (a.createdAt < b.createdAt ? 1 : -1),
  );
}
