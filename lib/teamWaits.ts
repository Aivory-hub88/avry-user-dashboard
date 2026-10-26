/**
 * ADR-021 §4.2 waits — SERVER-ONLY.
 *
 * `team_wait` parks the request an agent is blocked on in dashboard.workspace_agent_waits, with the
 * request text copied from the turn (not written by the model) and the agent's note. A wait wakes when
 * its `until` reminder fires, when a teammate finishes what the agent asked or delegated in that thread,
 * or from a webhook; the woken turn repeats the request. It stays open until `team_wait_close`, or
 * expires after 14 days.
 */

import { query } from "@/lib/db";
import { newId } from "@/lib/spaceWrite";
import { WAIT_MAX_OPEN_PER_THREAD, type OpenWait } from "@/lib/teamComms";

/** `from_agent` of a wake reminder filed from outside the room (requestWake). */
export const WEBHOOK_SENDER = "webhook";

/** Open waits of one space, optionally by id / thread / agent. Closed or expired ones are left out. */
export async function loadOpenWaits(
  spaceId: string,
  where: { ids?: string[]; threadRoot?: string; agentType?: string },
): Promise<(OpenWait & { threadRoot: string; agentType: string })[]> {
  const r = await query(
    `SELECT id, thread_root, agent_type, request_text, note, created_at FROM dashboard.workspace_agent_waits
     WHERE space_id = $1 AND status = 'open' AND expires_at > now()
       AND ($2::text[] IS NULL OR id = ANY($2))
       AND ($3::text IS NULL OR thread_root = $3)
       AND ($4::text IS NULL OR agent_type = $4)
     ORDER BY created_at ASC`,
    [spaceId, where.ids ?? null, where.threadRoot ?? null, where.agentType ?? null],
  );
  return (r.rows as Record<string, unknown>[]).map((w) => ({
    id: String(w.id),
    threadRoot: String(w.thread_root),
    agentType: String(w.agent_type),
    requestText: String(w.request_text ?? ""),
    note: String(w.note ?? ""),
    createdAt: new Date(String(w.created_at)).toISOString(),
  }));
}

/** Count a wake on these waits (they stay open until the agent closes them). */
export async function markWoken(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await query(
    `UPDATE dashboard.workspace_agent_waits SET wake_count = wake_count + 1, last_woken_at = now() WHERE id = ANY($1)`,
    [ids],
  );
}

/**
 * Open a wait for `agentType` in a thread, with a timed wake when `wakeAt` is set. The oldest open
 * waits beyond the per-thread limit are closed, so a new wait is never the one that is lost.
 */
export async function openWait(input: {
  spaceId: string;
  threadRoot: string;
  agentType: string;
  taskId: string;
  requestText: string;
  note: string;
  wakeAt: string | null;
  credentialOwner: string;
}): Promise<string> {
  const id = `w_${newId().replace(/[^A-Za-z0-9]/g, "").slice(0, 20)}`;
  await query(
    `INSERT INTO dashboard.workspace_agent_waits
       (id, space_id, thread_root, agent_type, task_id, request_text, note, credential_owner)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id, input.spaceId, input.threadRoot, input.agentType, input.taskId,
      input.requestText.slice(0, 4000), input.note.slice(0, 2000), input.credentialOwner,
    ],
  );
  await query(
    `UPDATE dashboard.workspace_agent_waits SET status = 'closed', closed_at = now(), close_note = 'superseded by a newer wait'
     WHERE id IN (
       SELECT id FROM dashboard.workspace_agent_waits
       WHERE space_id = $1 AND thread_root = $2 AND agent_type = $3 AND status = 'open'
       ORDER BY created_at DESC OFFSET ${WAIT_MAX_OPEN_PER_THREAD}
     )`,
    [input.spaceId, input.threadRoot, input.agentType],
  );
  if (input.wakeAt) {
    await query(
      `INSERT INTO dashboard.workspace_agent_reminders
         (id, space_id, thread_root, target_agent, from_agent, text, fire_at, credential_owner, wait_id)
       VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8)`,
      [newId(), input.spaceId, input.threadRoot, input.agentType, input.note.slice(0, 2000), input.wakeAt, input.credentialOwner, id],
    );
  }
  return id;
}

/**
 * Close one of the agent's open waits in a thread (or all of them when `waitId` is null), and cancel
 * their pending wake reminders. Returns how many were closed.
 */
export async function closeWaits(input: {
  spaceId: string;
  threadRoot: string;
  agentType: string;
  waitId: string | null;
  note: string;
}): Promise<number> {
  const closed = await query(
    `UPDATE dashboard.workspace_agent_waits SET status = 'closed', closed_at = now(), close_note = NULLIF($5, '')
     WHERE space_id = $1 AND thread_root = $2 AND agent_type = $3 AND status = 'open'
       AND ($4::text IS NULL OR id = $4)
     RETURNING id`,
    [input.spaceId, input.threadRoot, input.agentType, input.waitId, input.note.slice(0, 2000)],
  );
  const ids = (closed.rows as Record<string, unknown>[]).map((r) => String(r.id));
  if (ids.length > 0) {
    await query(
      `UPDATE dashboard.workspace_agent_reminders SET fired_at = now(), fire_outcome = 'skipped'
       WHERE wait_id = ANY($1) AND fired_at IS NULL`,
      [ids],
    );
  }
  return ids.length;
}

/**
 * Wake a wait from outside (a webhook, a member): file a due wake reminder for it, so the sweeper or the
 * room poll starts the turn with a real member credential. Returns false when the wait is not open.
 */
export async function requestWake(spaceId: string, waitId: string, reason: string): Promise<boolean> {
  const r = await query(
    `INSERT INTO dashboard.workspace_agent_reminders
       (id, space_id, thread_root, target_agent, from_agent, text, fire_at, credential_owner, wait_id)
     SELECT $1, w.space_id, w.thread_root, w.agent_type, '${WEBHOOK_SENDER}', $4, now(), w.credential_owner, w.id
     FROM dashboard.workspace_agent_waits w
     WHERE w.space_id = $2 AND w.id = $3 AND w.status = 'open' AND w.expires_at > now()
     RETURNING id`,
    [newId(), spaceId, waitId, reason.trim().slice(0, 500) || "woken by a webhook"],
  );
  return r.rows.length > 0;
}
