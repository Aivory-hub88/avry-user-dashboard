import { query } from "@/lib/db"
import { parseMentions, personKey, personLabel, type PersonRef } from "@/lib/workspaceDbModel"
import type { WorkspaceCredential } from "@/lib/workspaceAuth"
import { recordWorkspaceActivity } from "@/lib/workspaceActivity"
import { workspaceOf } from "@/lib/workspaceIndex"

/**
 * Mention fan-out (Fase 4b): @agent / @email tokens in written text become
 * inbox rows. Comments append (each comment is new); descriptions sync
 * (delete-then-insert per row so edits don't duplicate the inbox).
 */

type MentionInput = {
  docId: string
  rowId?: string
  credential: WorkspaceCredential
  agentType?: string
  source: "comment" | "description"
  text: string
}

function actorOf(credential: WorkspaceCredential, agentType: string) {
  if (credential.kind === "service") {
    const name = agentType !== "user" ? agentType.replace(/_/g, " ") : "agent"
    return { actorType: "agent", actorId: agentType, actorName: name }
  }
  return {
    actorType: "user",
    actorId: credential.user.user_id,
    actorName: credential.user.email ?? credential.user.user_id,
  }
}

export async function recordCommentMentions(input: MentionInput): Promise<void> {
  const { docId, rowId, credential, source, text } = input
  const agentType = input.agentType ?? "user"
  const { agents, emails } = parseMentions(text)
  if (agents.length === 0 && emails.length === 0) return
  try {
    const workspaceId = await workspaceOf(docId)
    const actor = actorOf(credential, agentType)
    const excerpt = text.trim().slice(0, 200)
    // One multi-row insert (parseMentions caps agents+emails at 20 each, so
    // at most 40 rows) instead of up to 40 sequential awaited INSERTs — this
    // blocked the comment/description save until every one finished.
    const kinds = [...agents.map(() => "agent"), ...emails.map(() => "user")]
    const ids = [...agents, ...emails]
    if (kinds.length > 0) {
      await query(
        `INSERT INTO dashboard.workspace_mentions
          (workspace_id, doc_id, row_id, actor_type, actor_id, actor_name, mentioned_kind, mentioned_id, source, excerpt)
         SELECT $1, $2, $3, $4, $5, $6, m.kind, m.id, $7, $8
         FROM unnest($9::text[], $10::text[]) AS m(kind, id)`,
        [workspaceId, docId, rowId ?? null, actor.actorType, actor.actorId, actor.actorName, source, excerpt, kinds, ids],
      )
    }
    const labels = [...agents.map((a) => `@${a}`), ...emails.map((e) => `@${e}`)]
    await recordWorkspaceActivity({
      docId,
      credential,
      agentType,
      action: "mention",
      summary: `${actor.actorName} mentioned ${labels.join(", ")}`,
      targetType: rowId ? "database-row" : "page",
      targetId: rowId,
      metadata: { agents, emails, source },
    })
  } catch (e) {
    console.error("[workspace mentions]", e)
  }
}

/** Replace description-source mentions for a row with a fresh parse. */
export async function syncDescriptionMentions(input: MentionInput): Promise<void> {
  try {
    await query(
      `DELETE FROM dashboard.workspace_mentions WHERE doc_id = $1 AND row_id = $2 AND source = 'description'`,
      [input.docId, input.rowId ?? null],
    )
  } catch (e) {
    console.error("[workspace mentions sync]", e)
    return
  }
  await recordCommentMentions({ ...input, source: "description" })
}

type AssignInput = {
  docId: string
  rowId: string
  credential: WorkspaceCredential
  agentType?: string
  /** Newly added assignees (already diffed by the caller). */
  added: PersonRef[]
  title: string
}

/**
 * Assignment fan-out: each newly assigned person/agent gets an inbox row
 * (source 'assigned', excerpt = task title). The actor never notifies
 * themself. Fire-and-forget: a failure is logged, never thrown.
 */
export async function recordAssignments(input: AssignInput): Promise<void> {
  const { docId, rowId, credential } = input
  const agentType = input.agentType ?? "user"
  const actor = actorOf(credential, agentType)
  const selfKey = actor.actorType === "user" ? `user:${actor.actorId}` : `agent:${actor.actorId}`
  const targets = input.added.filter((p) => personKey(p) !== selfKey)
  if (targets.length === 0) return
  try {
    const workspaceId = await workspaceOf(docId)
    const kinds = targets.map((p) => p.kind)
    const ids = targets.map((p) => (p.kind === "user" ? p.id : p.type))
    const excerpt = (input.title.trim() || "Untitled").slice(0, 200)
    await query(
      `INSERT INTO dashboard.workspace_mentions
        (workspace_id, doc_id, row_id, actor_type, actor_id, actor_name, mentioned_kind, mentioned_id, source, excerpt)
       SELECT $1, $2, $3, $4, $5, $6, m.kind, m.id, 'assigned', $7
       FROM unnest($8::text[], $9::text[]) AS m(kind, id)`,
      [workspaceId, docId, rowId, actor.actorType, actor.actorId, actor.actorName, excerpt, kinds, ids],
    )
    await recordWorkspaceActivity({
      docId,
      credential,
      agentType,
      action: "database.assigned",
      summary: `${actor.actorName} assigned ${targets.map(personLabel).join(", ")} to “${excerpt}”`,
      targetType: "database-row",
      targetId: rowId,
      metadata: { assigned: targets.map(personKey) },
    })
  } catch (e) {
    console.error("[workspace assignments]", e)
  }
}
