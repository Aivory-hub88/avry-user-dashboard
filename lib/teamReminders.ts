/**
 * ADR-021 reminders and waits — SERVER-ONLY.
 *
 * An agent's `team_remind` is stored in dashboard.workspace_agent_reminders. When it is due it fires: the
 * room posts the reminder as the agent that set it and starts the target's turn under a member's
 * credential, exactly like a human @mention. Two paths claim due reminders (atomically, so a reminder
 * fires once):
 *
 * - the room poll (timeline GET) of a member with write access, for every due reminder in the room;
 * - the backend sweeper (ADR-021 §4.1), which mints a short-lived token for the member whose turn set the
 *   reminder (`credential_owner`) and calls POST .../reminders/fire, so it fires with nobody in the room.
 *
 * A reminder claimed more than 10 minutes late follows its `missed_policy`: `run_once` fires it once and
 * says it is late, `skip` drops it. A reminder with a `wait_id` wakes that wait (team_wait, §4.2) instead:
 * the turn repeats the wait's original request and note.
 */

import { query } from "@/lib/db";
import { agentDisplayName } from "@/lib/spaceAgent";
import { enqueueTeamTask } from "@/lib/spaceAgentStore";
import { runAgentTask } from "@/lib/spaceAgentRun";
import { parseSpaceMentions } from "@/lib/spaceProtocol";
import { newId } from "@/lib/spaceWrite";
import {
  REMINDER_LATE_MS,
  teamTurnInstruction,
  waitWakeInstruction,
  type WakeCause,
} from "@/lib/teamComms";
import { loadOpenWaits, markWoken, WEBHOOK_SENDER } from "@/lib/teamWaits";
import type { WorkspaceCredential } from "@/lib/workspaceAuth";

/** Fire at most this many reminders per poll. */
const FIRE_BATCH = 3;
const LATE_SECONDS = Math.round(REMINDER_LATE_MS / 1000);

/** Postgres "undefined column": the follow-up #5 migration is not applied yet. */
const isMissingColumn = (error: unknown) => (error as { code?: string } | null)?.code === "42703";

async function claimDue(spaceId: string, owner: string | null): Promise<Record<string, unknown>[]> {
  try {
    const claimed = await query(
      `UPDATE dashboard.workspace_agent_reminders SET fired_at = now(),
         fire_outcome = CASE
           WHEN fire_at >= now() - interval '${LATE_SECONDS} seconds' THEN 'on_time'
           WHEN missed_policy = 'skip' THEN 'skipped'
           ELSE 'late' END
       WHERE id IN (
         SELECT id FROM dashboard.workspace_agent_reminders
         WHERE space_id = $1 AND fired_at IS NULL AND fire_at <= now()
           AND ($2::text IS NULL OR credential_owner = $2)
         ORDER BY fire_at ASC LIMIT ${FIRE_BATCH}
         FOR UPDATE SKIP LOCKED
       )
       RETURNING *`,
      [spaceId, owner],
    );
    return claimed.rows as Record<string, unknown>[];
  } catch (error) {
    if (!isMissingColumn(error)) throw error;
    // Before migrations/workspace-agent-followup5.sql: only the room poll fires, every reminder on time.
    if (owner) return [];
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
    return claimed.rows as Record<string, unknown>[];
  }
}

async function postAsAgent(spaceId: string, threadRoot: string, agentType: string, body: string): Promise<string> {
  const stamps = parseSpaceMentions(body);
  const msgId = newId();
  await query(
    `INSERT INTO dashboard.workspace_messages
       (id, space_id, thread_root, author_kind, author_id, author_name, agent_type,
        body, mentions, member_ids, here, has_agent, doc_refs, reply_to)
     VALUES ($1, $2, $3, 'agent', $4, $5, $4, $6, $7, $8, $9, $10, $11, NULL)`,
    [
      msgId, spaceId, threadRoot, agentType, agentDisplayName(agentType), body,
      stamps.agentTypes, stamps.memberIds, stamps.here, stamps.hasAgent, stamps.docRefs,
    ],
  );
  return msgId;
}

async function startTurn(
  spaceId: string,
  credential: Extract<WorkspaceCredential, { kind: "user" }>,
  input: Parameters<typeof enqueueTeamTask>[0],
): Promise<void> {
  const task = await enqueueTeamTask(input);
  if (task) {
    runAgentTask({ spaceId, taskId: task.id, credential }).catch((error) =>
      console.error("[workspace reminder run]", task.id, error),
    );
  }
}

/** A due wake reminder: the wait's agent gets a turn that repeats its request. */
async function fireWake(
  spaceId: string,
  row: Record<string, unknown>,
  credential: Extract<WorkspaceCredential, { kind: "user" }>,
): Promise<boolean> {
  const [wait] = await loadOpenWaits(spaceId, { ids: [String(row.wait_id)] });
  if (!wait) return false;
  // A webhook wake is filed by `requestWake` with from_agent 'webhook' and its reason as the text.
  const cause: WakeCause = row.from_agent === WEBHOOK_SENDER ? "webhook" : "reminder";
  const detail = cause === "webhook" ? String(row.text ?? "") : undefined;
  const msgId = await postAsAgent(
    spaceId,
    wait.threadRoot,
    wait.agentType,
    `⏳ [@${agentDisplayName(wait.agentType)}](#agent:${wait.agentType}) picking this up again: ${wait.note}`,
  );
  await markWoken([wait.id]);
  await startTurn(spaceId, credential, {
    spaceId,
    threadRoot: wait.threadRoot,
    triggerMsg: msgId,
    agentType: wait.agentType,
    instruction: waitWakeInstruction([wait], cause, detail),
    kind: "wake",
    fromAgent: wait.agentType,
    chain: { root: msgId, depth: 0 },
    reason: `wait woke (${cause})`,
  });
  return true;
}

/**
 * Fire due reminders of one room under `credential`. `owner` limits it to the reminders that member's
 * turns set (the backend sweeper's call); the room poll passes none and fires every due reminder.
 */
export async function fireDueReminders(
  spaceId: string,
  credential: Extract<WorkspaceCredential, { kind: "user" }>,
  opts: { owner?: string } = {},
): Promise<number> {
  const claimed = await claimDue(spaceId, opts.owner ?? null);
  let fired = 0;
  for (const row of claimed) {
    if (row.fire_outcome === "skipped") continue;
    try {
      if (typeof row.wait_id === "string" && row.wait_id) {
        if (await fireWake(spaceId, row, credential)) fired += 1;
        continue;
      }
      const target = String(row.target_agent);
      const from = String(row.from_agent);
      const text = String(row.text);
      const threadRoot = String(row.thread_root);
      const late = row.fire_outcome === "late" ? new Date(String(row.fire_at)).toISOString() : null;
      const msgId = await postAsAgent(
        spaceId,
        threadRoot,
        from,
        `⏰ [@${agentDisplayName(target)}](#agent:${target}) ${text}${late ? " _(late)_" : ""}`,
      );
      await startTurn(spaceId, credential, {
        spaceId,
        threadRoot,
        triggerMsg: msgId,
        agentType: target,
        instruction: teamTurnInstruction("reminder", from === target ? "" : agentDisplayName(from), text, {
          lateSince: late,
        }),
        kind: "reminder",
        fromAgent: from,
        // A reminder starts a conversation of its own.
        chain: { root: msgId, depth: 0 },
        reason: `reminder from ${agentDisplayName(from)}${late ? " (late)" : ""}`,
      });
      fired += 1;
    } catch (error) {
      console.error("[workspace reminder]", row.id, error);
    }
  }
  return fired;
}
