/**
 * ADR-021 reminders — SERVER-ONLY.
 *
 * An agent's `team_remind` is stored in dashboard.workspace_agent_reminders. When it is due and a
 * member with write access has the room open (the timeline poll), it fires: the room posts the
 * reminder as the agent that set it and starts the target's turn under that member's credential,
 * exactly like a human @mention. Claiming is atomic, so two open tabs fire a reminder once.
 */

import { query } from "@/lib/db";
import { agentDisplayName } from "@/lib/spaceAgent";
import { enqueueTeamTask } from "@/lib/spaceAgentStore";
import { runAgentTask } from "@/lib/spaceAgentRun";
import { parseSpaceMentions } from "@/lib/spaceProtocol";
import { newId } from "@/lib/spaceWrite";
import { teamTurnInstruction } from "@/lib/teamComms";
import type { WorkspaceCredential } from "@/lib/workspaceAuth";

/** Fire at most this many reminders per poll. */
const FIRE_BATCH = 3;

export async function fireDueReminders(
  spaceId: string,
  credential: Extract<WorkspaceCredential, { kind: "user" }>,
): Promise<number> {
  const claimed = await query(
    `UPDATE dashboard.workspace_agent_reminders SET fired_at = now()
     WHERE id IN (
       SELECT id FROM dashboard.workspace_agent_reminders
       WHERE space_id = $1 AND fired_at IS NULL AND fire_at <= now()
       ORDER BY fire_at ASC LIMIT ${FIRE_BATCH}
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`,
    [spaceId],
  );
  let fired = 0;
  for (const row of claimed.rows as Record<string, unknown>[]) {
    const target = String(row.target_agent);
    const from = String(row.from_agent);
    const text = String(row.text);
    const threadRoot = String(row.thread_root);
    try {
      const body = `⏰ [@${agentDisplayName(target)}](#agent:${target}) ${text}`;
      const stamps = parseSpaceMentions(body);
      const msgId = newId();
      await query(
        `INSERT INTO dashboard.workspace_messages
           (id, space_id, thread_root, author_kind, author_id, author_name, agent_type,
            body, mentions, member_ids, here, has_agent, doc_refs, reply_to)
         VALUES ($1, $2, $3, 'agent', $4, $5, $4, $6, $7, $8, $9, $10, $11, NULL)`,
        [
          msgId, spaceId, threadRoot, from, agentDisplayName(from), body,
          stamps.agentTypes, stamps.memberIds, stamps.here, stamps.hasAgent, stamps.docRefs,
        ],
      );
      const task = await enqueueTeamTask({
        spaceId,
        threadRoot,
        triggerMsg: msgId,
        agentType: target,
        instruction: teamTurnInstruction("reminder", from === target ? "" : agentDisplayName(from), text),
        kind: "reminder",
        fromAgent: from,
        // A reminder starts a conversation of its own.
        chain: { root: msgId, depth: 0 },
        reason: `reminder from ${agentDisplayName(from)}`,
      });
      if (task) {
        runAgentTask({ spaceId, taskId: task.id, credential }).catch((error) =>
          console.error("[workspace reminder run]", task.id, error),
        );
      }
      fired += 1;
    } catch (error) {
      console.error("[workspace reminder]", row.id, error);
    }
  }
  return fired;
}
