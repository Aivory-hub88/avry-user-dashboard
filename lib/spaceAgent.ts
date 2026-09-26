/**
 * Team Space agent types — CLIENT-SAFE (zod + roster saja).
 *
 * Aturan bundling: file ini TIDAK BOLEH mengimpor `@/lib/db` (pg =
 * node-builtins) — ia diimpor langsung oleh komponen client
 * (SpaceAgentPanel). Query + enqueue tinggal di `lib/spaceAgentStore.ts`
 * (server-only). Pelajaran: build prod Turbopack gagal dengan
 * `Can't resolve 'dns'/'fs'/'net'` saat rantai ini bocor (2026-09-17).
 *
 * Stamp `#agent:<type>` → 1 task row per agent (status todo, reason wajib).
 * agent_type di stamp = agent_type yang mengeksekusi, 1:1 dengan gate
 * workspace_agent_acl (TRD §5 — tanpa router).
 */

import { z } from "zod";
import { AGENT_ROSTER } from "@/lib/agentRoster";

export const SpaceAgentTaskSchema = z.object({
  id: z.string().min(1),
  spaceId: z.string().min(1),
  threadRoot: z.string().min(1),
  triggerMsg: z.string().min(1),
  agentType: z.string().min(1),
  instruction: z.string().min(1),
  status: z.enum(["todo", "in_progress", "blocked", "done", "failed", "cancelled"]),
  reason: z.string(),
  resultMsg: z.string().min(1).nullable(),
  approvalRef: z.record(z.string(), z.unknown()),
  createdBy: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type SpaceAgentTask = z.infer<typeof SpaceAgentTaskSchema>;

const LINK_RE =
  /\[(@[^\[\]\\]+|#[^\[\]\\]+)\]\(#(?:member:[^\)\s]+|agent:[^\)\s]+|here|doc:[^\)\s]+)\)/g;

/** Token link → label polos untuk instruksi agent (`[@Geno](#agent:x)` → `@Geno`). */
export function stripInstruction(body: string): string {
  return body.replace(LINK_RE, (_m, label: string) => label).trim();
}

export function agentDisplayName(agentType: string): string {
  return AGENT_ROSTER.find((a) => a.type === agentType)?.name ?? agentType;
}

// ── Run payload (gaya Room group-chat context, LobeHub RFC-130) ────────────
// Tiap agent menerima 3 hal yang sama: siapa di thread + transkrip bersama
// ber-tag author + instruksi. Tanpa ini "@Geno bantu @Teo" dijawab seperti
// 1:1 baru: tak terlihat itu pesan grup, siapa lagi disapa, apa kata lain.

export interface SpacePayloadEntry {
  author: string;
  text: string;
}

export interface SpacePayloadParams {
  /** Instruksi polos (token sudah jadi label). */
  instruction: string;
  /** Transkrip room sebelum giliran ini, tertua-dulu. */
  history: SpacePayloadEntry[];
  /** Room the turn happens in (ADR-019 P3): brief, task board, files, excerpts. */
  room?: SpaceRoomContext | null;
}

/** Same shape as lib/roomContext's RoomContext, declared here so this module stays client-safe. */
export interface SpaceRoomContext {
  brief: string;
  tasks: string;
  files: string;
  excerpts: { file: string; text: string }[];
}

// Room context caps (chars): brief + tasks + 5 excerpts ≈ 2.5k tokens at most.
const MAX_BRIEF_CHARS = 1500;
const MAX_TASKS_CHARS = 2500;
const MAX_FILES_CHARS = 800;
const MAX_EXCERPT_CHARS = 900;

function block(tag: string, body: string, max: number): string[] {
  const t = body.trim();
  if (!t) return [];
  return [`<${tag}>`, t.length > max ? `${t.slice(0, max)}…` : t, `</${tag}>`];
}

// 12 × 500 chars ≈ 1.5k tokens: enough room-wide context without bloating each turn.
const MAX_HISTORY_ENTRIES = 12;
const MAX_HISTORY_CHARS = 500;

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/**
 * Payload turn discussion: transkrip + instruksi polos (DATA).
 *
 * Identitas channel ("kamu di thread Team Space X sebagai Y") TIDAK
 * disuntik di sini — itu tugas deployment channel backend
 * (binding discussion_* + room session), sama seperti console/telegram.
 * Men-coaching ulang per-pesan hanya memanjangkan prompt tanpa menambah
 * informasi yang belum dimiliki session.
 */
export function buildSpacePayload({ instruction, history, room }: SpacePayloadParams): string {
  const lines: string[] = [];
  if (room) {
    lines.push(...block("room_brief", room.brief, MAX_BRIEF_CHARS));
    lines.push(...block("room_tasks", room.tasks, MAX_TASKS_CHARS));
    lines.push(...block("room_files", room.files, MAX_FILES_CHARS));
    if (room.excerpts.length > 0) {
      lines.push("<file_excerpts>");
      for (const e of room.excerpts) lines.push(`[${e.file}]`, clip(e.text, MAX_EXCERPT_CHARS));
      lines.push("</file_excerpts>");
    }
  }
  const recent = history.filter((h) => h.text.trim()).slice(-MAX_HISTORY_ENTRIES);
  if (recent.length > 0) {
    lines.push("<thread_history>");
    for (const h of recent) lines.push(`${h.author}: ${clip(h.text, MAX_HISTORY_CHARS)}`);
    lines.push("</thread_history>");
  }

  lines.push("<instruction>");
  lines.push(instruction.trim());
  lines.push("</instruction>");
  return lines.join("\n");
}

function iso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  return typeof v === "string" ? v : "";
}

export function spaceAgentTaskFromRow(row: Record<string, unknown>): SpaceAgentTask | null {
  const parsed = SpaceAgentTaskSchema.safeParse({
    id: String(row.id ?? ""),
    spaceId: String(row.space_id ?? ""),
    threadRoot: String(row.thread_root ?? ""),
    triggerMsg: String(row.trigger_msg ?? ""),
    agentType: String(row.agent_type ?? ""),
    instruction: String(row.instruction ?? ""),
    status: String(row.status ?? ""),
    reason: String(row.reason ?? ""),
    resultMsg: typeof row.result_msg === "string" ? row.result_msg : null,
    approvalRef:
      row.approval_ref && typeof row.approval_ref === "object"
        ? (row.approval_ref as Record<string, unknown>)
        : {},
    createdBy: String(row.created_by ?? ""),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  });
  return parsed.success ? parsed.data : null;
}
