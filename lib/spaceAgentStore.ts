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

export interface TeamTaskInput {
  spaceId: string;
  threadRoot: string;
  /** The message that carries this turn's request (the asker's ❓ message, a reminder, …). */
  triggerMsg: string;
  agentType: string;
  instruction: string;
  /** ADR-021 turn kind: ask | answer | delegate | report | handoff | reminder. */
  kind: string;
  /** The agent that asked / delegated / reminded (null for a human). */
  fromAgent: string | null;
  /** Task id waiting on this one (the asker's / delegator's turn). */
  replyTo?: string | null;
  dueAt?: string | null;
  chain: { root: string; depth: number };
  reason: string;
}

/**
 * One ADR-021 team turn (needs migrations/workspace-agent-comms.sql). Not deduped against open
 * tasks: the planner already skips teammates with an open turn in the thread.
 */
export async function enqueueTeamTask(input: TeamTaskInput): Promise<SpaceAgentTask | null> {
  const inserted = await query(
    `INSERT INTO dashboard.workspace_agent_tasks
       (id, space_id, thread_root, trigger_msg, agent_type, instruction,
        status, reason, created_by, chain_root, chain_depth, kind, from_agent, reply_to, due_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'todo', $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING *`,
    [
      newId(),
      input.spaceId,
      input.threadRoot,
      input.triggerMsg,
      input.agentType,
      input.instruction,
      input.reason,
      input.fromAgent ? `agent:${input.fromAgent}` : "system:reminder",
      input.chain.root,
      input.chain.depth,
      input.kind,
      input.fromAgent,
      input.replyTo ?? null,
      input.dueAt ?? null,
    ],
  );
  return spaceAgentTaskFromRow(inserted.rows[0] as Record<string, unknown>);
}
