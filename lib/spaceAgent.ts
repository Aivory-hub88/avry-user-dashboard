/**
 * Team Space agent dispatcher — Phase 3 (F4).
 *
 * Stamp `#agent:<type>` → 1 task row per agent (status todo, reason wajib).
 * agent_type di stamp = agent_type yang mengeksekusi, 1:1 dengan gate
 * workspace_agent_acl (TRD §5 — tanpa router).
 *
 * Eksekusi dijemput client-triggered via .../agent-tasks/[task]/run
 * (teruskan JWT user ke backend agent-chat). Tidak ada service baru.
 */

import { z } from "zod";
import { query } from "@/lib/db";
import { AGENT_ROSTER } from "@/lib/agentRoster";
import type { MentionStamps } from "@/lib/spaceProtocol";
import { newId } from "@/lib/spaceWrite";

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

export interface EnqueueInput {
  spaceId: string;
  threadRoot: string;
  triggerMsg: string;
  stamps: MentionStamps;
  body: string;
  createdBy: string;
}

/**
 * Tulis 1 task `todo` per agent_type ter-stamp (dedupe: abaikan agent yang
 * sudah punya task terbuka di thread ini — mention ulang bukan duplikat).
 */
export async function enqueueAgentTasks(input: EnqueueInput): Promise<SpaceAgentTask[]> {
  const { spaceId, threadRoot, triggerMsg, stamps, body, createdBy } = input;
  if (stamps.agentTypes.length === 0) return [];
  const instruction = stripInstruction(body);
  if (!instruction) return [];

  const open = await query(
    `SELECT agent_type FROM dashboard.workspace_agent_tasks
     WHERE space_id = $1 AND thread_root = $2
       AND status IN ('todo', 'in_progress', 'blocked')`,
    [spaceId, threadRoot],
  );
  const busy = new Set((open.rows as Record<string, unknown>[]).map((r) => String(r.agent_type)));
  const fresh = stamps.agentTypes.filter((t) => !busy.has(t));
  if (fresh.length === 0) return [];

  const out: SpaceAgentTask[] = [];
  for (const agentType of fresh) {
    const inserted = await query(
      `INSERT INTO dashboard.workspace_agent_tasks
         (id, space_id, thread_root, trigger_msg, agent_type, instruction,
          status, reason, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'todo', $7, $8)
       RETURNING *`,
      [
        newId(),
        spaceId,
        threadRoot,
        triggerMsg,
        agentType,
        instruction,
        `mention di thread oleh ${createdBy}`,
        createdBy,
      ],
    );
    const task = spaceAgentTaskFromRow(inserted.rows[0] as Record<string, unknown>);
    if (task) out.push(task);
  }
  return out;
}
