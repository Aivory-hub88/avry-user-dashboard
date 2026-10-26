/**
 * Agent run core — SERVER-ONLY (db + backend fetch).
 *
 * Dipakai dua arah: route run (tombol Jalankan / lanjutkan approval) dan
 * fire-and-forget dari POST messages (chat-room: mention → agent jalan
 * sendiri tanpa klik). Hanya kredensial user (JWT diteruskan ke backend).
 */

import { query } from "@/lib/db";
import { recordWorkspaceActivity } from "@/lib/workspaceActivity";
import { parseSpaceMentions } from "@/lib/spaceProtocol";
import { spaceMessageFromRow } from "@/lib/spaceThreads";
import type { SpaceMessage } from "@/lib/spaceProtocol";
import {
  spaceAgentTaskFromRow,
  agentDisplayName,
  buildSpacePayload,
  pickSpaceLeader,
  actingAsFor,
  stripInstruction,
  type SpaceAgentTask,
} from "@/lib/spaceAgent";
import { newId } from "@/lib/spaceWrite";
import { ingestRoomFiles, loadRoomContext } from "@/lib/roomContext";
import { linkAgentMentions, planHandoffs } from "@/lib/agentHandoff";
import { enqueueAgentTasks, enqueueTeamTask } from "@/lib/spaceAgentStore";
import {
  droppedNote,
  openWaitsNote,
  parseTeamActions,
  planTeamActions,
  requestTextOf,
  teamActionMessage,
  teamAnswersInstruction,
  teamTurnInstruction,
  unattendedTurnOrigin,
  type PlannedAction,
  type TeamAction,
  type TeamAnswer,
} from "@/lib/teamComms";
import { closeWaits, loadOpenWaits, markWoken, openWait } from "@/lib/teamWaits";
import type { WorkspaceCredential } from "@/lib/workspaceAuth";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://backend.aivory.id";

// Room-wide transcript size for each agent turn (buildSpacePayload also caps entries).
const ROOM_HISTORY_MESSAGES = 20;
// A turn waits at most this long for new room files to be read before it
// goes ahead with whatever is already indexed (ingest keeps going after).
const INGEST_WAIT_MS = 10_000;

/** Owner (leader) of a Space, or null when unknown/ownerless. */
async function loadSpaceLeader(spaceId: string): Promise<string | null> {
  const bare = spaceId.replace(/^workspace:/, "").replace(/^db:/, "");
  const found = await query(
    `SELECT id, owner FROM dashboard.workspace_docs WHERE id = ANY($1)`,
    [[bare, `workspace:${bare}`]],
  );
  return pickSpaceLeader(found.rows as { id: unknown; owner: unknown }[], spaceId);
}

/** Agents invited to this Space (the only ones that can be handed work). */
async function loadSpaceAgents(spaceId: string): Promise<string[]> {
  const bare = spaceId.replace(/^workspace:/, "").replace(/^db:/, "");
  try {
    const r = await query(`SELECT agent_type FROM dashboard.workspace_agent_acl WHERE doc_id = $1`, [bare]);
    return (r.rows as Record<string, unknown>[]).map((x) => String(x.agent_type)).filter(Boolean);
  } catch {
    return [];
  }
}

/** Turns used so far in a chain, per agent, and agents with an open turn in the thread. */
async function loadChainState(spaceId: string, root: string, threadRoot: string) {
  const used = await query(
    `SELECT agent_type, count(*)::int AS n FROM dashboard.workspace_agent_tasks
     WHERE space_id = $1 AND (chain_root = $2 OR (chain_root IS NULL AND trigger_msg = $2))
     GROUP BY agent_type`,
    [spaceId, root],
  );
  const usedPerAgent: Record<string, number> = {};
  let usedTotal = 0;
  for (const r of used.rows as Record<string, unknown>[]) {
    usedPerAgent[String(r.agent_type)] = Number(r.n);
    usedTotal += Number(r.n);
  }
  const open = await query(
    `SELECT agent_type FROM dashboard.workspace_agent_tasks
     WHERE space_id = $1 AND thread_root = $2 AND status IN ('todo', 'in_progress', 'blocked')`,
    [spaceId, threadRoot],
  );
  const busy = (open.rows as Record<string, unknown>[]).map((r) => String(r.agent_type));
  return { usedPerAgent, usedTotal, busy };
}

/** Post a message in a thread as `agentType`. Returns the new message id. */
async function postAgentMessage(
  spaceId: string,
  threadRoot: string,
  agentType: string,
  body: string,
  replyTo: string | null,
): Promise<string> {
  const stamps = parseSpaceMentions(body);
  const msgId = newId();
  await query(
    `INSERT INTO dashboard.workspace_messages
       (id, space_id, thread_root, author_kind, author_id, author_name, agent_type,
        body, mentions, member_ids, here, has_agent, doc_refs, reply_to)
     VALUES ($1, $2, $3, 'agent', $4, $5, $4, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id`,
    [
      msgId, spaceId, threadRoot, agentType, agentDisplayName(agentType), body,
      stamps.agentTypes, stamps.memberIds, stamps.here, stamps.hasAgent, stamps.docRefs, replyTo,
    ],
  );
  return msgId;
}

/** The quoted part of a team-turn instruction (`[Question from X]\n…`), else the whole text. */
function quotedPart(instruction: string): string {
  const m = /\n\[(?:Question|Task|Handoff|Answer|Report) from [^\]]+\]\n([\s\S]*)$/.exec(instruction);
  return (m ? m[1] : instruction).trim();
}

const agentLink = (type: string) => `[@${agentDisplayName(type)}](#agent:${type})`;

/**
 * ADR-021: carry out the speech acts an agent made with its team tools. Each one is posted as that
 * agent's own message (quoting its reply); ask / delegate / handoff also start the teammate's turn,
 * and remind schedules a reminder. Runs under the same user credential as the chain's first turn.
 * Best effort: a failure never fails the reply that was already posted.
 */
async function executeTeamPlan(opts: {
  spaceId: string;
  task: SpaceAgentTask;
  planned: PlannedAction[];
  replyMsg: string;
  credential: Extract<WorkspaceCredential, { kind: "user" }>;
}): Promise<void> {
  const { spaceId, task, planned, replyMsg, credential } = opts;
  const root = task.chainRoot ?? task.triggerMsg;
  const depth = (task.chainDepth ?? 0) + 1;
  const fromName = agentDisplayName(task.agentType);
  const toRun: string[] = [];
  for (const action of planned) {
    try {
      const msgId = await postAgentMessage(
        spaceId, task.threadRoot, task.agentType, teamActionMessage(action, agentLink), replyMsg,
      );
      if (action.kind === "remind") {
        await insertReminder(spaceId, task, action, credential.user.user_id);
        continue;
      }
      if (action.kind === "wait") {
        await openWait({
          spaceId,
          threadRoot: task.threadRoot,
          agentType: task.agentType,
          taskId: task.id,
          // Copied by the room, so the request survives the turn and any compaction (ADR-021 §4.2).
          requestText: requestTextOf(task.instruction),
          note: action.text,
          wakeAt: action.wakeAt,
          credentialOwner: credential.user.user_id,
        });
        continue;
      }
      if (action.kind === "wait_close") {
        await closeWaits({
          spaceId,
          threadRoot: task.threadRoot,
          agentType: task.agentType,
          waitId: action.waitId,
          note: action.text,
        });
        continue;
      }
      if (action.kind === "message") continue;
      const queued = action.queued === true;
      const created = await enqueueTeamTask({
        spaceId,
        threadRoot: task.threadRoot,
        triggerMsg: msgId,
        agentType: action.target,
        instruction: teamTurnInstruction(action.kind, fromName, action.text, {
          dueAt: action.kind === "delegate" ? action.dueAt : null,
        }),
        kind: action.kind,
        fromAgent: task.agentType,
        // The asker / delegator is told when this turn finishes; a handoff waits on nobody.
        replyTo: action.kind === "handoff" ? null : task.id,
        dueAt: action.kind === "delegate" ? action.dueAt : null,
        chain: { root, depth },
        reason: `${action.kind} from ${fromName}`,
        queued,
      });
      // A queued turn starts when the teammate's open turn in this thread ends.
      if (created && !queued) toRun.push(created.id);
    } catch (error) {
      console.error("[workspace team action]", action.kind, error);
    }
  }
  if (planned.length > 0) {
    await recordWorkspaceActivity({
      docId: spaceId,
      credential,
      agentType: task.agentType,
      action: "agent.team",
      summary: `${fromName}: ${planned.map((a) => `${a.kind} ${agentDisplayName(a.target)}`).join(", ")}`,
    }).catch(() => {});
  }
  for (const id of toRun) {
    runAgentTask({ spaceId, taskId: id, credential }).catch((error) =>
      console.error("[workspace team auto-run]", id, error),
    );
  }
}

/**
 * Store a reminder with the member whose credential this turn runs under, so the backend sweeper can
 * fire it with nobody in the room (ADR-021 §4.1). Before the follow-up migration only the room poll fires.
 */
async function insertReminder(
  spaceId: string,
  task: SpaceAgentTask,
  action: Extract<PlannedAction, { kind: "remind" }>,
  owner: string,
): Promise<void> {
  const base = [newId(), spaceId, task.threadRoot, action.target, task.agentType, action.text, action.fireAt];
  try {
    await query(
      `INSERT INTO dashboard.workspace_agent_reminders
         (id, space_id, thread_root, target_agent, from_agent, text, fire_at, credential_owner, missed_policy)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [...base, owner, action.missedPolicy],
    );
  } catch (error) {
    if ((error as { code?: string } | null)?.code !== "42703") throw error;
    await query(
      `INSERT INTO dashboard.workspace_agent_reminders
         (id, space_id, thread_root, target_agent, from_agent, text, fire_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      base,
    );
  }
}

/** The waiter's open waits in this thread, counted as woken: a teammate finishing may be what it waits on. */
async function wakeWaitsForAnswer(spaceId: string, threadRoot: string, waiter: string): Promise<string> {
  try {
    const waits = await loadOpenWaits(spaceId, { threadRoot, agentType: waiter });
    await markWoken(waits.map((w) => w.id));
    return openWaitsNote(waits);
  } catch {
    // Before migrations/workspace-agent-followup5.sql there are no waits.
    return "";
  }
}

/** A sibling in one of these states is still on the request, so the answers wait for it. */
const STILL_WORKING = new Set(["todo", "in_progress"]);

/**
 * ADR-021: when an asked / delegated turn ends, done or failed, give the agent waiting on it a turn
 * with the outcome, so it can continue its own work.
 *
 * - Gathered: when the asker asked several teammates in one turn, the answers wait until the last
 *   teammate still working ends, then arrive in one turn. A teammate parked on an approval does not
 *   hold the others; its answer comes in a later turn.
 * - Never lost: a failed teammate is reported ("no answer comes from …"), and a busy asker gets the
 *   turn queued behind its open one. The chain budget already paid for the ask, so the answer is not
 *   counted against it again (an ask at the depth limit could otherwise never be answered).
 * - Once: the outcomes are claimed atomically (`routed_at`), so two teammates that finish together
 *   give the asker one turn.
 */
async function routeAnswers(opts: {
  spaceId: string;
  task: SpaceAgentTask;
  roomAgents?: string[];
  credential: Extract<WorkspaceCredential, { kind: "user" }>;
}): Promise<void> {
  const { spaceId, task, credential } = opts;
  const waiter = task.fromAgent;
  const waitingOn = task.replyTo;
  if ((task.kind !== "ask" && task.kind !== "delegate") || !waiter || !waitingOn) return;
  try {
    const toTasks = (rows: unknown[]) =>
      rows
        .map((r) => spaceAgentTaskFromRow(r as Record<string, unknown>))
        .filter((t): t is SpaceAgentTask => t !== null);
    const siblings = toTasks(
      (
        await query(
          `SELECT * FROM dashboard.workspace_agent_tasks
           WHERE space_id = $1 AND reply_to = $2 AND kind IN ('ask', 'delegate')`,
          [spaceId, waitingOn],
        )
      ).rows,
    );
    if (siblings.some((s) => s.id !== task.id && STILL_WORKING.has(s.status))) return;
    const claimed = toTasks(
      (
        await query(
          `UPDATE dashboard.workspace_agent_tasks SET routed_at = now()
           WHERE space_id = $1 AND reply_to = $2 AND kind IN ('ask', 'delegate')
             AND status IN ('done', 'failed') AND routed_at IS NULL
           RETURNING *`,
          [spaceId, waitingOn],
        )
      ).rows,
    ).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (claimed.length === 0) return;
    const roomAgents = opts.roomAgents ?? (await loadSpaceAgents(spaceId));
    if (!roomAgents.includes(waiter)) return;

    const resultIds = claimed.flatMap((t) => (t.status === "done" && t.resultMsg ? [t.resultMsg] : []));
    const bodies = new Map<string, string>();
    if (resultIds.length > 0) {
      const found = await query(`SELECT id, body FROM dashboard.workspace_messages WHERE id = ANY($1)`, [resultIds]);
      for (const r of found.rows as Record<string, unknown>[]) bodies.set(String(r.id), String(r.body ?? ""));
    }
    const answers: TeamAnswer[] = claimed.map((t) => {
      const reply = t.status === "done" && t.resultMsg ? (bodies.get(t.resultMsg) ?? null) : null;
      return {
        kind: t.kind === "delegate" ? "delegate" : "ask",
        fromName: agentDisplayName(t.agentType),
        original: quotedPart(t.instruction),
        reply,
        ...(reply === null ? { failure: t.status === "failed" ? t.reason : "its reply could not be read" } : {}),
      };
    });
    const pending = siblings.filter((s) => s.status === "blocked").map((s) => agentDisplayName(s.agentType));
    const kind = claimed.every((t) => t.kind === "delegate") ? "report" : "answer";
    const last = claimed[claimed.length - 1];
    const state = await loadChainState(spaceId, task.chainRoot ?? task.triggerMsg, task.threadRoot);
    const queued = state.busy.includes(waiter);
    const waitsNote = await wakeWaitsForAnswer(spaceId, task.threadRoot, waiter);
    const created = await enqueueTeamTask({
      spaceId,
      threadRoot: task.threadRoot,
      triggerMsg: last.resultMsg ?? last.triggerMsg,
      agentType: waiter,
      instruction: teamAnswersInstruction(answers, pending) + waitsNote,
      kind,
      fromAgent: last.agentType,
      replyTo: null,
      chain: { root: task.chainRoot ?? task.triggerMsg, depth: Math.max(...claimed.map((t) => t.chainDepth ?? 0)) + 1 },
      reason: `${kind} from ${claimed.map((t) => agentDisplayName(t.agentType)).join(", ")}`,
      queued,
    });
    if (created && !queued) {
      runAgentTask({ spaceId, taskId: created.id, credential }).catch((error) =>
        console.error("[workspace team answer-run]", created.id, error),
      );
    }
  } catch (error) {
    console.error("[workspace team answer]", error);
  }
}

/**
 * Start the oldest queued team turn of `agentType` in this thread, once the agent has no other
 * turn there. Called when one of its turns ends, and from the room poll as a safety net.
 */
async function startQueued(
  spaceId: string,
  threadRoot: string,
  agentType: string,
  credential: Extract<WorkspaceCredential, { kind: "user" }>,
): Promise<void> {
  try {
    const open = await query(
      `SELECT id FROM dashboard.workspace_agent_tasks
       WHERE space_id = $1 AND thread_root = $2 AND agent_type = $3
         AND (status IN ('in_progress', 'blocked') OR (status = 'todo' AND NOT queued))
       LIMIT 1`,
      [spaceId, threadRoot, agentType],
    );
    if (open.rows.length > 0) return;
    const next = await query(
      `UPDATE dashboard.workspace_agent_tasks SET queued = false, updated_at = now()
       WHERE id = (
         SELECT id FROM dashboard.workspace_agent_tasks
         WHERE space_id = $1 AND thread_root = $2 AND agent_type = $3 AND status = 'todo' AND queued
         ORDER BY created_at ASC LIMIT 1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING id`,
      [spaceId, threadRoot, agentType],
    );
    const nextId = (next.rows[0] as Record<string, unknown> | undefined)?.id;
    if (typeof nextId === "string") {
      runAgentTask({ spaceId, taskId: nextId, credential }).catch((error) =>
        console.error("[workspace queued run]", nextId, error),
      );
    }
  } catch (error) {
    // Before migrations/workspace-agent-comms-routing.sql there is no `queued` column and nothing waits.
    console.error("[workspace queued]", error);
  }
}

/**
 * Room poll safety net (ADR-021): start queued team turns whose agent has nothing open in their
 * thread any more, as after a restart between a turn's end and its queue drain.
 */
export async function startIdleQueuedTurns(
  spaceId: string,
  credential: Extract<WorkspaceCredential, { kind: "user" }>,
): Promise<void> {
  const waiting = await query(
    `SELECT DISTINCT thread_root, agent_type FROM dashboard.workspace_agent_tasks
     WHERE space_id = $1 AND status = 'todo' AND queued
     LIMIT 3`,
    [spaceId],
  );
  for (const r of waiting.rows as Record<string, unknown>[]) {
    await startQueued(spaceId, String(r.thread_root), String(r.agent_type), credential);
  }
}

/** Team actions a parked turn made, merged with the resumed turn's own (same action once). */
function withHeldActions(held: TeamAction[], fresh: TeamAction[]): TeamAction[] {
  const seen = new Set<string>();
  return [...held, ...fresh].filter((a) => {
    const key = `${a.kind}\u0000${a.to.toLowerCase()}\u0000${a.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * ADR-020: a reply that @mentions a teammate hands work over. Enqueues a task for them
 * (created_by `agent:<type>`) in the same thread and runs it, so they answer in their own
 * message. Bounded by depth / turns per chain / turns per agent (lib/agentHandoff). Runs
 * under the SAME user credential as the chain's first turn, so tenant (acting-as-leader),
 * credits and the approval gate behave exactly as for a human @mention. Best effort: a
 * failure here (e.g. migrations/workspace-agent-handoff.sql not applied) never fails the
 * reply that was already posted.
 */
async function spawnHandoffs(opts: {
  spaceId: string;
  task: SpaceAgentTask;
  linkedReply: string;
  msgId: string;
  candidates: { type: string; name: string }[];
  credential: Extract<WorkspaceCredential, { kind: "user" }>;
}): Promise<void> {
  const { spaceId, task, linkedReply, msgId, candidates, credential } = opts;
  if (candidates.length < 2) return;
  try {
    const root = task.chainRoot ?? task.triggerMsg;
    const depth = task.chainDepth ?? 0;
    const { usedPerAgent, usedTotal, busy } = await loadChainState(spaceId, root, task.threadRoot);
    const next = planHandoffs(linkedReply, candidates, task.agentType, {
      depth,
      usedPerAgent,
      usedTotal,
      queued: busy,
    });
    if (next.length === 0) return;

    const stamps = parseSpaceMentions(linkedReply);
    const fromName = agentDisplayName(task.agentType);
    const created = await enqueueAgentTasks({
      spaceId,
      threadRoot: task.threadRoot,
      triggerMsg: msgId,
      stamps: { ...stamps, agentTypes: next, hasAgent: true },
      body: linkedReply,
      createdBy: `agent:${task.agentType}`,
      chain: { root, depth: depth + 1 },
      instruction: `Handoff dari ${fromName}: ${stripInstruction(linkedReply)}`,
    });
    if (created.length === 0) return;
    await recordWorkspaceActivity({
      docId: spaceId,
      credential,
      agentType: task.agentType,
      action: "agent.handoff",
      summary: `${fromName} handed work to ${created.map((t) => agentDisplayName(t.agentType)).join(", ")}`,
    }).catch(() => {});
    for (const t of created) {
      runAgentTask({ spaceId, taskId: t.id, credential }).catch((error) =>
        console.error("[workspace handoff auto-run]", t.id, error),
      );
    }
  } catch (error) {
    console.error("[workspace handoff]", error);
  }
}

export async function loadAgentTask(spaceId: string, taskId: string): Promise<SpaceAgentTask | null> {
  const found = await query(
    `SELECT * FROM dashboard.workspace_agent_tasks WHERE id = $1 AND space_id = $2`,
    [taskId, spaceId],
  );
  if (found.rows.length === 0) return null;
  return spaceAgentTaskFromRow(found.rows[0] as Record<string, unknown>);
}

export async function setAgentTask(
  taskId: string,
  status: string,
  reason: string,
  extra?: Record<string, unknown>,
) {
  const sets = ["status = $2", "reason = $3", "updated_at = now()"];
  const values: unknown[] = [taskId, status, reason];
  if (extra?.approvalRef !== undefined) {
    sets.push(`approval_ref = $${values.length + 1}`);
    values.push(JSON.stringify(extra.approvalRef));
  }
  if (extra?.resultMsg !== undefined) {
    sets.push(`result_msg = $${values.length + 1}`);
    values.push(extra.resultMsg);
  }
  await query(`UPDATE dashboard.workspace_agent_tasks SET ${sets.join(", ")} WHERE id = $1`, values);
}

export interface RunResult {
  task: SpaceAgentTask | null;
  message?: SpaceMessage | null;
  pendingApproval?: { id: string; tool_name: string; risk_tier: string } | null;
  error?: string;
  status: number;
}

/**
 * Jalankan 1 task sebagai user ini. Idempoten-aman: task yang tidak lagi
 * runnable (sudah diambil worker lain) → 409, tanpa efek samping.
 */
export async function runAgentTask(opts: {
  spaceId: string;
  taskId: string;
  credential: Extract<WorkspaceCredential, { kind: "user" }>;
  afterApprovalId?: string | null;
  decision?: "approve" | "deny";
}): Promise<RunResult> {
  const { spaceId: id, taskId, credential, afterApprovalId, decision = "approve" } = opts;
  const task = await loadAgentTask(id, taskId);
  if (!task) return { task: null, error: "not found", status: 404 };
  const runnable =
    task.status === "todo" || task.status === "failed" || (task.status === "blocked" && !!afterApprovalId);
  if (!runnable) return { task, error: `task ${task.status}`, status: 409 };

  // Claim atomically: the Run button, an auto-run and a queue drain can reach the same task at once,
  // and only one of them may call the agent (and carry out its team actions).
  const claim = await query(
    `UPDATE dashboard.workspace_agent_tasks SET status = 'in_progress', reason = 'running', updated_at = now()
     WHERE id = $1 AND space_id = $2 AND (status IN ('todo', 'failed') OR (status = 'blocked' AND $3::boolean))
     RETURNING *`,
    [taskId, id, !!afterApprovalId],
  );
  const claimedRow = claim.rows[0] as Record<string, unknown> | undefined;
  if (!claimedRow) {
    const now = await loadAgentTask(id, taskId);
    return { task: now, error: `task ${now?.status ?? "gone"}`, status: 409 };
  }
  const heldActions = parseTeamActions(claimedRow.held_actions);
  if (task.status === "failed" && task.replyTo) {
    // A re-run's new answer goes to the asker too, even though the failure was routed already.
    await query(`UPDATE dashboard.workspace_agent_tasks SET routed_at = NULL WHERE id = $1`, [taskId]).catch(() => {});
  }

  const instruction = afterApprovalId
    ? `${task.instruction}\n\n[Approval ${afterApprovalId} diputuskan ${decision} oleh manusia — lanjutkan turn yang diparkir.]`
    : task.instruction;

  // Transkrip room (data mentah): 20 pesan terakhir di seluruh Space, bukan
  // hanya thread pemicu — room ala Console adalah satu percakapan linear,
  // jadi agent harus melihat apa yang baru dibahas di luar thread-nya
  // (ADR-019 P2). Identitas + konteks channel milik deployment channel
  // backend (binding discussion_* + room session) — tanpa coaching prompt.
  let prompt = instruction;
  try {
    const hist = await query(
      `SELECT * FROM (
         SELECT author_kind, author_id, author_name, agent_type, body, created_at
         FROM dashboard.workspace_messages
         WHERE space_id = $1 AND deleted_at IS NULL
         ORDER BY created_at DESC LIMIT ${ROOM_HISTORY_MESSAGES}
       ) h ORDER BY created_at ASC`,
      [id],
    );
    const history = (hist.rows as Record<string, unknown>[])
      .map((r) => {
        const kind = String(r.author_kind ?? "user");
        const name =
          kind === "agent"
            ? agentDisplayName(String(r.agent_type ?? ""))
            : typeof r.author_name === "string" && r.author_name
              ? r.author_name
              : String(r.author_id ?? "Someone");
        return { author: name, text: typeof r.body === "string" ? r.body : "" };
      })
      .filter((h) => h.text.trim());
    await Promise.race([ingestRoomFiles(id), new Promise((r) => setTimeout(r, INGEST_WAIT_MS))]);
    const room = await loadRoomContext(id, instruction, task.agentType);
    const spaceAgents = await loadSpaceAgents(id);
    const teammates = spaceAgents.filter((a) => a !== task.agentType).map(agentDisplayName);
    prompt = buildSpacePayload({
      instruction,
      history,
      room,
      teammates,
      hop: (task.chainDepth ?? 0) > 0 ? task.chainDepth : undefined,
    });
  } catch {
    // Konteks best-effort — instruksi polos tetap jalan.
  }

  let reply = "";
  let pendingApproval: { id: string; tool_name: string; risk_tier: string } | null = null;
  let teamActionsRaw: unknown = null;
  let runOutcome: { kind: "quiet" } | { kind: "failed"; reason: string } | null = null;
  const turnOrigin = unattendedTurnOrigin(task.kind);
  try {
    // Agents here are the leader's: run the turn in the leader's tenant, billed
    // to them, with this member as requester (backend re-verifies both).
    const actingAs = actingAsFor(await loadSpaceLeader(id), credential.user.user_id);
    const upstream = await fetch(`${BACKEND_URL}/api/v1/telegram/discussion-turn`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${credential.token}`,
      },
      body: JSON.stringify({
        agent_type: task.agentType,
        space_id: id,
        thread_root: task.threadRoot,
        text: prompt,
        ...(actingAs ? { acting_as: actingAs } : {}),
        // ADR-021 §4.3: nobody waits on a reminder / wake turn, so it may end quietly or as failed.
        ...(turnOrigin ? { turn_origin: turnOrigin } : {}),
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!upstream.ok) throw new Error(`agent-chat ${upstream.status}`);
    const data = (await upstream.json()) as {
      reply?: unknown;
      pending_approval?: { id: string; tool_name: string; risk_tier: string } | null;
      team_actions?: unknown;
      run_outcome?: unknown;
      run_failure_reason?: unknown;
    };
    reply = typeof data.reply === "string" ? data.reply.trim() : "";
    pendingApproval = data.pending_approval ?? null;
    teamActionsRaw = data.team_actions ?? null;
    // Only an unattended turn can end quietly or as failed; a conversation turn always answers.
    if (turnOrigin && data.run_outcome === "quiet") runOutcome = { kind: "quiet" };
    if (turnOrigin && data.run_outcome === "failed") {
      const why = typeof data.run_failure_reason === "string" ? data.run_failure_reason.trim().slice(0, 300) : "";
      runOutcome = { kind: "failed", reason: why || "the agent reported the run as failed" };
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message.slice(0, 300) : "agent unreachable";
    await setAgentTask(taskId, "failed", reason);
    await recordWorkspaceActivity({
      docId: id,
      credential,
      agentType: task.agentType,
      action: "agent.failed",
      summary: `${agentDisplayName(task.agentType)} failed: ${reason}`,
    }).catch(() => {});
    await turnEnded(id, task, credential);
    return { task: await loadAgentTask(id, taskId), error: "agent unreachable", status: 502 };
  }

  if (pendingApproval) {
    // Team actions made before the park would be lost: the resumed turn sees them as done in its
    // history and does not call the tools again. Keep them for the resumed turn to carry out.
    const parked = withHeldActions(heldActions, parseTeamActions(teamActionsRaw));
    if (parked.length > 0) {
      await query(`UPDATE dashboard.workspace_agent_tasks SET held_actions = $2::jsonb WHERE id = $1`, [
        taskId,
        JSON.stringify(parked),
      ]).catch((error) => console.error("[workspace team held]", error));
    }
    await setAgentTask(taskId, "blocked", `waiting for approval: ${pendingApproval.tool_name}`, {
      approvalRef: pendingApproval,
    });
    return { task: await loadAgentTask(id, taskId), pendingApproval, status: 200 };
  }

  if (runOutcome?.kind === "quiet") return finishQuietRun(id, task, heldActions, teamActionsRaw, credential);

  if (!reply && runOutcome?.kind !== "failed") {
    await setAgentTask(taskId, "failed", "agent returned empty reply");
    await turnEnded(id, task, credential);
    return { task: await loadAgentTask(id, taskId), error: "empty reply", status: 502 };
  }

  // Tulis balik sebagai agent itu (message, bukan artifact) + reason terlihat.
  // Plain @Name from the agent becomes the space's link token, so the message shows a
  // mention chip and carries the agent stamp (and can hand work over, ADR-020).
  const spaceAgentsForReply = await loadSpaceAgents(id);
  const candidates = spaceAgentsForReply.map((type) => ({ type, name: agentDisplayName(type) }));

  // ADR-021: the agent's team actions, planned against the room before its reply is posted so
  // anything the room cannot carry out is said in that same message.
  const teamActions = withHeldActions(heldActions, parseTeamActions(teamActionsRaw));
  let plan: ReturnType<typeof planTeamActions> | null = null;
  if (teamActions.length > 0) {
    try {
      const state = await loadChainState(id, task.chainRoot ?? task.triggerMsg, task.threadRoot);
      plan = planTeamActions(
        teamActions,
        candidates,
        task.agentType,
        { depth: task.chainDepth ?? 0, ...state, busy: state.busy.filter((a) => a !== task.agentType) },
        Date.now(),
      );
    } catch (error) {
      console.error("[workspace team plan]", error);
    }
  }

  // A failed unattended run says why first, so the room sees it was not done (ADR-021 §4.3).
  const failed = runOutcome?.kind === "failed" ? runOutcome.reason : null;
  const body = failed ? `⚠️ Could not complete this run: ${failed}${reply ? `\n\n${reply}` : ""}` : reply;
  const linkedReply = linkAgentMentions(body + (plan ? droppedNote(plan.dropped) : ""), candidates);
  const stamps = parseSpaceMentions(linkedReply);
  const msgId = newId();
  const name = agentDisplayName(task.agentType);
  const inserted = await query(
    `INSERT INTO dashboard.workspace_messages
       (id, space_id, thread_root, author_kind, author_id, author_name, agent_type,
        body, mentions, member_ids, here, has_agent, doc_refs, reply_to)
     VALUES ($1, $2, $3, 'agent', $4, $5, $4, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      msgId, id, task.threadRoot, task.agentType, name, linkedReply,
      stamps.agentTypes, stamps.memberIds, stamps.here, stamps.hasAgent, stamps.docRefs,
      // The room quotes the message that asked (ADR-019 P2).
      task.triggerMsg,
    ],
  );
  const message = spaceMessageFromRow(inserted.rows[0] as Record<string, unknown>, id);
  await setAgentTask(taskId, failed ? "failed" : "done", failed ? `run failed: ${failed}` : "agent reply", {
    resultMsg: msgId,
  });
  await recordWorkspaceActivity({
    docId: id,
    credential,
    agentType: task.agentType,
    action: failed ? "agent.failed" : "agent.replied",
    summary: failed ? `${name} reported a failed run: ${failed}` : `${name} replied in the thread`,
  }).catch(() => {});
  // An asked / delegated turn answers the agent waiting on it (ADR-021).
  await routeAnswers({ spaceId: id, task, roomAgents: spaceAgentsForReply, credential });
  if (plan) {
    await executeTeamPlan({ spaceId: id, task, planned: plan.planned, replyMsg: msgId, credential });
  } else {
    // No team tools used: a plain @Name in the reply still hands work over (ADR-020).
    await spawnHandoffs({ spaceId: id, task, linkedReply, msgId, candidates, credential });
  }
  if (heldActions.length > 0) {
    await query(`UPDATE dashboard.workspace_agent_tasks SET held_actions = NULL WHERE id = $1`, [taskId]).catch(() => {});
  }
  await startQueued(id, task.threadRoot, task.agentType, credential);
  return { task: await loadAgentTask(id, taskId), message, status: 200 };
}

/**
 * ADR-021 §4.3: an unattended turn (reminder, woken wait) that called run_no_update. Nothing is posted and
 * nobody is notified; the task is done, and any team actions the turn made (closing a wait, a new
 * reminder) are still carried out.
 */
async function finishQuietRun(
  spaceId: string,
  task: SpaceAgentTask,
  heldActions: TeamAction[],
  teamActionsRaw: unknown,
  credential: Extract<WorkspaceCredential, { kind: "user" }>,
): Promise<RunResult> {
  await setAgentTask(task.id, "done", "quiet run: nothing to report");
  const actions = withHeldActions(heldActions, parseTeamActions(teamActionsRaw));
  if (actions.length > 0) {
    try {
      const roomAgents = await loadSpaceAgents(spaceId);
      const candidates = roomAgents.map((type) => ({ type, name: agentDisplayName(type) }));
      const state = await loadChainState(spaceId, task.chainRoot ?? task.triggerMsg, task.threadRoot);
      const plan = planTeamActions(
        actions,
        candidates,
        task.agentType,
        { depth: task.chainDepth ?? 0, ...state, busy: state.busy.filter((a) => a !== task.agentType) },
        Date.now(),
      );
      // No reply of its own to quote: the actions answer the message that started the turn.
      await executeTeamPlan({ spaceId, task, planned: plan.planned, replyMsg: task.triggerMsg, credential });
    } catch (error) {
      console.error("[workspace quiet run actions]", error);
    }
  }
  if (heldActions.length > 0) {
    await query(`UPDATE dashboard.workspace_agent_tasks SET held_actions = NULL WHERE id = $1`, [task.id]).catch(() => {});
  }
  await turnEnded(spaceId, task, credential);
  return { task: await loadAgentTask(spaceId, task.id), message: null, status: 200 };
}

/** A turn failed: the agent waiting on it hears so, and the next queued turn of this agent starts. */
async function turnEnded(
  spaceId: string,
  task: SpaceAgentTask,
  credential: Extract<WorkspaceCredential, { kind: "user" }>,
): Promise<void> {
  await routeAnswers({ spaceId, task, credential });
  await startQueued(spaceId, task.threadRoot, task.agentType, credential);
}
