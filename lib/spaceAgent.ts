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
