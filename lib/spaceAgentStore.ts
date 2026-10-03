/**
 * Team Space agent store — SERVER-ONLY (mengimpor `@/lib/db`).
 *
 * Jangan impor file ini dari komponen client — lihat peringatan bundling
 * di `lib/spaceAgent.ts`.
 */

import { query } from "@/lib/db";
import type { MentionStamps } from "@/lib/spaceProtocol";
import { newId } from "@/lib/spaceWrite";
import {
  spaceAgentTaskFromRow,
  stripInstruction,
  type SpaceAgentTask,
} from "@/lib/spaceAgent";

export interface EnqueueInput {
  spaceId: string;
  threadRoot: string;
  triggerMsg: string;
  stamps: MentionStamps;
  body: string;
  createdBy: string;
  /** Handoff from an agent's reply (ADR-020): the chain it belongs to. */
  chain?: { root: string; depth: number };
  /** Overrides the instruction derived from `body` (handoffs prefix who handed it over). */
  instruction?: string;
}

/**
 * Tulis 1 task `todo` per agent_type ter-stamp (dedupe: abaikan agent yang
 * sudah punya task terbuka di thread ini — mention ulang bukan duplikat).
 */
export async function enqueueAgentTasks(input: EnqueueInput): Promise<SpaceAgentTask[]> {
  const { spaceId, threadRoot, triggerMsg, stamps, body, createdBy, chain } = input;
  if (stamps.agentTypes.length === 0) return [];
  const instruction = input.instruction ?? stripInstruction(body);
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
    // Only handoff tasks touch the chain columns, so human-created tasks keep working
    // even before migrations/workspace-agent-handoff.sql has been applied.
    const inserted = await query(
      chain
        ? `INSERT INTO dashboard.workspace_agent_tasks
             (id, space_id, thread_root, trigger_msg, agent_type, instruction,
              status, reason, created_by, chain_root, chain_depth)
           VALUES ($1, $2, $3, $4, $5, $6, 'todo', $7, $8, $9, $10)
           RETURNING *`
        : `INSERT INTO dashboard.workspace_agent_tasks
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
        `mentioned in thread by ${createdBy}`,
        createdBy,
        ...(chain ? [chain.root, chain.depth] : []),
      ],
    );
    const task = spaceAgentTaskFromRow(inserted.rows[0] as Record<string, unknown>);
    if (task) out.push(task);
  }
  return out;
}
