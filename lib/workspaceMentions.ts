import { query } from "@/lib/db"
import { fieldNoticeExcerpt, mentionPlainText, parseMentions, personKey, personLabel, type FieldPeopleAdded, type PersonRef } from "@/lib/workspaceDbModel"
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

export function actorOf(credential: WorkspaceCredential, agentType: string) {
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

/**
 * Write mention inbox rows for `text`. Returns the person keys that were
 * notified (`user:<id>` for picker mentions, `agent:<type>`), so the caller
 * can skip them when it notifies followers of the same comment.
 */
export async function recordCommentMentions(input: MentionInput): Promise<string[]> {
  const { docId, rowId, credential, source, text } = input
  const agentType = input.agentType ?? "user"
  const actor = actorOf(credential, agentType)
  const parsed = parseMentions(text)
  // Never notify yourself (picker tokens carry ids; emails match the actor's own email).
  const selfEmail = credential.kind === "user" ? credential.user.email?.toLowerCase() : undefined
  const agents = parsed.agents.filter((a) => !(actor.actorType === "agent" && a === actor.actorId))
  const users = parsed.users.filter((u) => !(actor.actorType === "user" && u === actor.actorId))
  const emails = parsed.emails.filter((e) => e !== selfEmail)
  if (agents.length === 0 && emails.length === 0 && users.length === 0) return []
  try {
    const workspaceId = await workspaceOf(docId)
    const excerpt = mentionPlainText(text).trim().slice(0, 200)
    // One multi-row insert (parseMentions caps each list at 20, so at most
    // 60 rows) instead of sequential awaited INSERTs that blocked the save.
    const kinds = [...agents.map(() => "agent"), ...emails.map(() => "user"), ...users.map(() => "user")]
    const ids = [...agents, ...emails, ...users]
    await query(
      `INSERT INTO dashboard.workspace_mentions
        (workspace_id, doc_id, row_id, actor_type, actor_id, actor_name, mentioned_kind, mentioned_id, source, excerpt)
       SELECT $1, $2, $3, $4, $5, $6, m.kind, m.id, $7, $8
       FROM unnest($9::text[], $10::text[]) AS m(kind, id)`,
      [workspaceId, docId, rowId ?? null, actor.actorType, actor.actorId, actor.actorName, source, excerpt, kinds, ids],
    )
    const labels = [...agents.map((a) => `@${a}`), ...emails.map((e) => `@${e}`), ...users.map(() => "@member")]
    await recordWorkspaceActivity({
      docId,
      credential,
      agentType,
      action: "mention",
      summary: `${actor.actorName} mentioned ${labels.join(", ")}`,
      targetType: rowId ? "database-row" : "page",
      targetId: rowId,
      metadata: { agents, emails, users, source },
    })
    return [...users.map((u) => `user:${u}`), ...agents.map((a) => `agent:${a}`)]
  } catch (e) {
    console.error("[workspace mentions]", e)
    return []
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

/** Inbox kinds a follower can get (dashboard.workspace_mentions.source). */
export type FollowerNotice = "commented" | "status_done" | "due_changed"

type FollowerInput = {
  docId: string
  rowId: string
  credential: WorkspaceCredential
  agentType?: string
  followers: PersonRef[]
  kind: FollowerNotice
  /** Inbox line under the actor: task title, or the comment text. */
  excerpt: string
  /** Person keys already told about this (e.g. @mentioned in the comment). */
  skip?: string[]
}

/**
 * Follower fan-out: each person following the task gets one inbox row.
 * Only people are notified (agents follow for context, their inbox is for
 * mentions/assignments); the actor and `skip` never are. The same notice
 * (same task, kind and text) is not repeated to a person within 10 minutes,
 * so a replayed client report can't spam an inbox. Fire-and-forget.
 */
export async function notifyFollowers(input: FollowerInput): Promise<number> {
  const agentType = input.agentType ?? "user"
  const actor = actorOf(input.credential, agentType)
  const selfKey = actor.actorType === "user" ? `user:${actor.actorId}` : `agent:${actor.actorId}`
  const skip = new Set([selfKey, ...(input.skip ?? [])])
  const ids = input.followers.filter((p) => p.kind === "user" && !skip.has(personKey(p))).map((p) => (p.kind === "user" ? p.id : ""))
  if (ids.length === 0) return 0
  try {
    const workspaceId = await workspaceOf(input.docId)
    await query(
      `INSERT INTO dashboard.workspace_mentions
        (workspace_id, doc_id, row_id, actor_type, actor_id, actor_name, mentioned_kind, mentioned_id, source, excerpt)
       SELECT $1, $2, $3, $4, $5, $6, 'user', u.id, $7, $8
       FROM unnest($9::text[]) AS u(id)
       WHERE NOT EXISTS (
         SELECT 1 FROM dashboard.workspace_mentions w
         WHERE w.doc_id = $2 AND w.row_id = $3 AND w.source = $7 AND w.excerpt = $8
           AND w.mentioned_kind = 'user' AND w.mentioned_id = u.id
           AND w.created_at > now() - interval '10 minutes'
       )`,
      [
        workspaceId,
        input.docId,
        input.rowId,
        actor.actorType,
        actor.actorId,
        actor.actorName,
        input.kind,
        mentionPlainText(input.excerpt).trim().slice(0, 200) || "Untitled",
        ids,
      ],
    )
    return ids.length
  } catch (e) {
    console.error("[workspace followers]", e)
    return 0
  }
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

type FieldAssignInput = {
  docId: string
  rowId: string
  credential: WorkspaceCredential
  agentType?: string
  /** Newly set people per person field (already diffed by the caller). */
  fields: FieldPeopleAdded[]
  title: string
}

/**
 * "X set you as Reviewer on <task>": each person newly set on a person field
 * gets an inbox row (source 'field_assigned', excerpt "<field>\n<title>"). The
 * actor never notifies themself, and the same notice isn't repeated to a
 * person within 10 minutes (a replayed client report). Returns how many rows
 * were asked for. Fire-and-forget: a failure is logged, never thrown.
 */
export async function recordFieldAssignments(input: FieldAssignInput): Promise<number> {
  const { docId, rowId, credential } = input
  const agentType = input.agentType ?? "user"
  const actor = actorOf(credential, agentType)
  const selfKey = actor.actorType === "user" ? `user:${actor.actorId}` : `agent:${actor.actorId}`
  const kinds: string[] = []
  const ids: string[] = []
  const excerpts: string[] = []
  const summaries: string[] = []
  for (const f of input.fields) {
    const targets = f.added.filter((p) => personKey(p) !== selfKey)
    if (targets.length === 0) continue
    const excerpt = fieldNoticeExcerpt(f.fieldName, input.title)
    for (const p of targets) {
      kinds.push(p.kind)
      ids.push(p.kind === "user" ? p.id : p.type)
      excerpts.push(excerpt)
    }
    summaries.push(`${targets.map(personLabel).join(", ")} as ${f.fieldName}`)
  }
  if (ids.length === 0) return 0
  try {
    const workspaceId = await workspaceOf(docId)
    await query(
      `INSERT INTO dashboard.workspace_mentions
        (workspace_id, doc_id, row_id, actor_type, actor_id, actor_name, mentioned_kind, mentioned_id, source, excerpt)
       SELECT $1, $2, $3, $4, $5, $6, m.kind, m.id, 'field_assigned', m.excerpt
       FROM unnest($7::text[], $8::text[], $9::text[]) AS m(kind, id, excerpt)
       WHERE NOT EXISTS (
         SELECT 1 FROM dashboard.workspace_mentions w
         WHERE w.doc_id = $2 AND w.row_id = $3 AND w.source = 'field_assigned' AND w.excerpt = m.excerpt
           AND w.mentioned_kind = m.kind AND w.mentioned_id = m.id
           AND w.created_at > now() - interval '10 minutes'
       )`,
      [workspaceId, docId, rowId, actor.actorType, actor.actorId, actor.actorName, kinds, ids, excerpts],
    )
    await recordWorkspaceActivity({
      docId,
      credential,
      agentType,
      action: "database.field_assigned",
      summary: `${actor.actorName} set ${summaries.join("; ")} on “${input.title.trim() || "Untitled"}”`.slice(0, 300),
      targetType: "database-row",
      targetId: rowId,
      metadata: { fields: input.fields.map((f) => ({ field: f.fieldId, added: f.added.map(personKey) })) },
    })
    return ids.length
  } catch (e) {
    console.error("[workspace field assignments]", e)
    return 0
  }
}

type UnblockedInput = {
  docId: string
  /** The task that can start now. */
  rowId: string
  credential: WorkspaceCredential
  agentType?: string
  /** Its assignees + owner (people and agents). */
  recipients: PersonRef[]
  /** Inbox line: the unblocked task's title. */
  excerpt: string
}

/**
 * "Your task is unblocked": the last open blocker of a task is Done, so its
 * assignees and owner hear about it (source 'unblocked'). The actor never
 * notifies themself, and the same notice isn't repeated to a person within
 * 10 minutes (a blocker toggled Done → Todo → Done). Fire-and-forget.
 */
export async function notifyUnblocked(input: UnblockedInput): Promise<number> {
  const agentType = input.agentType ?? "user"
  const actor = actorOf(input.credential, agentType)
  const selfKey = actor.actorType === "user" ? `user:${actor.actorId}` : `agent:${actor.actorId}`
  const seen = new Set<string>([selfKey])
  const targets: PersonRef[] = []
  for (const p of input.recipients) {
    const k = personKey(p)
    if (seen.has(k)) continue
    seen.add(k)
    targets.push(p)
  }
  if (targets.length === 0) return 0
  try {
    const workspaceId = await workspaceOf(input.docId)
    await query(
      `INSERT INTO dashboard.workspace_mentions
        (workspace_id, doc_id, row_id, actor_type, actor_id, actor_name, mentioned_kind, mentioned_id, source, excerpt)
       SELECT $1, $2, $3, $4, $5, $6, m.kind, m.id, 'unblocked', $7
       FROM unnest($8::text[], $9::text[]) AS m(kind, id)
       WHERE NOT EXISTS (
         SELECT 1 FROM dashboard.workspace_mentions w
         WHERE w.doc_id = $2 AND w.row_id = $3 AND w.source = 'unblocked'
           AND w.mentioned_kind = m.kind AND w.mentioned_id = m.id
           AND w.created_at > now() - interval '10 minutes'
       )`,
      [
        workspaceId,
        input.docId,
        input.rowId,
        actor.actorType,
        actor.actorId,
        actor.actorName,
        (input.excerpt.trim() || "Untitled").slice(0, 200),
        targets.map((p) => p.kind),
        targets.map((p) => (p.kind === "user" ? p.id : p.type)),
      ],
    )
    return targets.length
  } catch (e) {
    console.error("[workspace unblocked]", e)
    return 0
  }
}
