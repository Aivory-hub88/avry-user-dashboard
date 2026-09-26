/**
 * Agents that speak up on their own — SERVER-ONLY (ADR-019 P4).
 *
 * Two triggers so far:
 * - room.opened: a request was approved → the lead agent posts a kickoff
 * - file.added: someone uploaded a file with text → the lead agent sums it up
 *
 * Each trigger always posts a short system note to the room (free, no LLM),
 * then — unless the room is in "observe" mode or over its daily budget —
 * queues a turn for the room's lead agent (the first agent invited) and runs
 * it as the room owner (lib/proactiveAuth). Agents can't trigger agents:
 * their replies never enqueue tasks (only POST /messages does), so a
 * proactive turn can't start a chain.
 */
import { query } from "@/lib/db"
import { newId } from "@/lib/spaceWrite"
import { parseSpaceMentions } from "@/lib/spaceProtocol"
import { recordWorkspaceActivity } from "@/lib/workspaceActivity"
import { runAgentTask } from "@/lib/spaceAgentRun"
import { ownerCredential } from "@/lib/proactiveAuth"

export type Autonomy = "observe" | "suggest" | "act"
export const PROACTIVE_DAILY_BUDGET = 20
export const PROACTIVE_CREATED_BY = "system:proactive"

export function autonomyOf(props: Record<string, unknown> | null | undefined): Autonomy {
  const a = props?.autonomy
  return a === "observe" || a === "act" ? a : "suggest"
}

/** In "suggest" the agent proposes; changing data is left to people. */
function guardrail(autonomy: Autonomy): string {
  return autonomy === "act"
    ? ""
    : "\n\nDon't change any data or run tools that write anything. Propose what to do and let the team decide."
}

export const KICKOFF_INSTRUCTION =
  "This room just opened from an approved project request. Using the room brief, task board and files, post a short kickoff: " +
  "what you understand the goal to be, the first three steps you propose, and anything you need from the team. Keep it under 150 words."

export const fileInstruction = (name: string) =>
  `A new file was just added to the room: "${name}". Summarise what's in it in at most three bullets, ` +
  "then say in one sentence how it affects the project. Keep it under 100 words."

interface RoomRow {
  owner: string | null
  workspace_id: string
  props: Record<string, unknown> | null
  deleted_at: string | null
}

async function loadRoom(roomId: string): Promise<RoomRow | null> {
  const r = await query(`SELECT id, owner, workspace_id, props, deleted_at FROM dashboard.workspace_docs WHERE id = $1 OR id = $2`, [
    `workspace:${roomId}`,
    roomId,
  ])
  const rows = r.rows as (RoomRow & { id: string })[]
  const row = rows.find((x) => x.id === `workspace:${roomId}`) ?? rows[0]
  return row && !row.deleted_at && row.owner ? row : null
}

/** First agent invited to the room with write access. */
async function leadAgent(roomId: string): Promise<string | null> {
  const r = await query(
    `SELECT agent_type FROM dashboard.workspace_agent_acl WHERE doc_id = $1 AND role = 'editor' ORDER BY created_at ASC LIMIT 1`,
    [roomId],
  )
  return (r.rows[0]?.agent_type as string | undefined) ?? null
}

async function usedToday(roomId: string): Promise<number> {
  const r = await query(
    `SELECT count(*)::int AS n FROM dashboard.workspace_agent_tasks
     WHERE space_id = $1 AND created_by = $2 AND created_at > now() - interval '1 day'`,
    [roomId, PROACTIVE_CREATED_BY],
  )
  return Number(r.rows[0]?.n ?? 0)
}

/** A root message from "Aivory" (author_kind system). Returns its id. */
export async function postSystemNote(roomId: string, body: string): Promise<string> {
  const id = newId()
  const stamps = parseSpaceMentions(body)
  await query(`INSERT INTO dashboard.workspace_threads (id, space_id, created_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [
    id,
    roomId,
    PROACTIVE_CREATED_BY,
  ])
  await query(
    `INSERT INTO dashboard.workspace_messages
       (id, space_id, thread_root, author_kind, author_id, author_name, agent_type,
        body, mentions, member_ids, here, has_agent, doc_refs)
     VALUES ($1, $2, NULL, 'system', 'aivory', 'Aivory', NULL, $3, '{}', '{}', false, false, $4)`,
    [id, roomId, body, stamps.docRefs],
  )
  return id
}

export type TurnOutcome = "started" | "no-room" | "observe" | "no-agent" | "over-budget" | "no-owner-credential"

/**
 * Post the note, then (guardrails permitting) queue and start the lead
 * agent's turn. The turn itself runs in the background.
 */
export async function proactiveTurn(opts: {
  roomId: string
  trigger: "room.opened" | "file.added"
  note: string
  instruction: string
}): Promise<TurnOutcome> {
  const { roomId, trigger, note, instruction } = opts
  const room = await loadRoom(roomId)
  if (!room) return "no-room"
  const noteId = await postSystemNote(roomId, note)

  const autonomy = autonomyOf(room.props)
  if (autonomy === "observe") return "observe"
  const agent = await leadAgent(roomId)
  if (!agent) return "no-agent"
  if ((await usedToday(roomId)) >= PROACTIVE_DAILY_BUDGET) {
    await recordWorkspaceActivity({
      docId: roomId,
      credential: { kind: "service", token: "" },
      agentType: agent,
      action: "agent.budget_exceeded",
      summary: `Daily limit of ${PROACTIVE_DAILY_BUDGET} unprompted agent turns reached; ${trigger} skipped`,
    }).catch(() => {})
    return "over-budget"
  }
  const credential = await ownerCredential(room.owner!)
  if (!credential) return "no-owner-credential"

  const taskId = newId()
  await query(
    `INSERT INTO dashboard.workspace_agent_tasks
       (id, space_id, thread_root, trigger_msg, agent_type, instruction, status, reason, created_by)
     VALUES ($1, $2, $3, $3, $4, $5, 'todo', $6, $7)`,
    [taskId, roomId, noteId, agent, instruction + guardrail(autonomy), `proactive: ${trigger}`, PROACTIVE_CREATED_BY],
  )
  await recordWorkspaceActivity({
    docId: roomId,
    credential,
    agentType: agent,
    action: "agent.proactive",
    targetType: "agent-task",
    targetId: taskId,
    summary: `${trigger}: ${agent} started on its own`,
    metadata: { trigger, autonomy },
  }).catch(() => {})
  void runAgentTask({ spaceId: roomId, taskId, credential }).catch((e) => console.error("[proactive run]", taskId, e))
  return "started"
}

export function onRoomOpened(roomId: string): Promise<TurnOutcome> {
  return proactiveTurn({
    roomId,
    trigger: "room.opened",
    note: "This room opened from an approved project request.",
    instruction: KICKOFF_INSTRUCTION,
  })
}

export function onFileAdded(roomId: string, fileName: string, addedBy: string): Promise<TurnOutcome> {
  return proactiveTurn({
    roomId,
    trigger: "file.added",
    note: `${addedBy} added ${fileName}.`,
    instruction: fileInstruction(fileName),
  })
}
