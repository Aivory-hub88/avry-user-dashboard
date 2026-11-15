import type { WorkspaceCredential } from "@/lib/workspaceAuth"
import { recordWorkspaceActivity } from "@/lib/workspaceActivity"
import { notifyFollowers, notifyUnblocked, recordCommentMentions } from "@/lib/workspaceMentions"
import { mentionPlainText, personKey, personLabel, unblockedBy, type PersonRef, type RowChange, type TaskComment } from "@/lib/workspaceDbModel"

/**
 * Task side effects shared by the REST routes and the UI's event endpoint
 * (the Tasks UI writes rows through Yjs, so it reports what changed after
 * the fact): one activity entry per tracked change, plus inbox rows for
 * the task's followers. Activity and notices are best-effort — a failure
 * is logged, never thrown into the user's edit.
 */

type RowCtx = {
  docId: string
  rowId: string
  credential: WorkspaceCredential
  agentType?: string
  title: string
  followers: PersonRef[]
  /**
   * The doc's rows after the change. When given, a move to Done also tells
   * the tasks this row was the last open blocker of (see recordUnblocked).
   */
  rows?: UnblockRow[]
}

/** What recordUnblocked needs of a row (DbRow satisfies it). */
export type UnblockRow = {
  id: string
  title: string
  status: string
  blockedBy: string[]
  assignees: PersonRef[]
  owner: PersonRef | null
}

/**
 * `doneId` just moved to Done: every task it was the last open blocker of
 * gets an activity entry, and its assignees + owner an inbox row
 * ('unblocked'). Best-effort, like the rest of this file.
 */
export async function recordUnblocked(
  ctx: { docId: string; credential: WorkspaceCredential; agentType?: string },
  rows: UnblockRow[],
  doneId: string,
): Promise<string[]> {
  const agentType = ctx.agentType ?? "user"
  const done = rows.find((r) => r.id === doneId)
  const freed = unblockedBy(rows, doneId)
  for (const r of freed) {
    try {
      await recordWorkspaceActivity({
        docId: ctx.docId,
        credential: ctx.credential,
        agentType,
        action: "database.unblocked",
        summary: `“${titleOf(r.title)}” is unblocked — “${titleOf(done?.title ?? "")}” is Done`,
        targetType: "database-row",
        targetId: r.id,
        metadata: { blocker: doneId },
      })
    } catch (e) {
      console.error("[workspace task events]", e)
    }
    await notifyUnblocked({
      docId: ctx.docId,
      rowId: r.id,
      credential: ctx.credential,
      agentType,
      recipients: [...r.assignees, ...(r.owner ? [r.owner] : [])],
      excerpt: titleOf(r.title),
    })
  }
  return freed.map((r) => r.id)
}

function titleOf(t: string): string {
  return (t.trim() || "Untitled").slice(0, 160)
}

function personSummary(p: PersonRef | null): string {
  return p ? personLabel(p) : "nobody"
}

/** Activity + follower notices for status / due / owner changes. */
export async function recordRowChanges(ctx: RowCtx, changes: RowChange[]): Promise<void> {
  const agentType = ctx.agentType ?? "user"
  const title = titleOf(ctx.title)
  for (const c of changes) {
    try {
      if (c.kind === "status") {
        await recordWorkspaceActivity({
          docId: ctx.docId,
          credential: ctx.credential,
          agentType,
          action: "database.status_changed",
          summary: `Moved “${title}” from ${c.from} to ${c.to}`,
          targetType: "database-row",
          targetId: ctx.rowId,
          metadata: { from: c.from, to: c.to },
        })
        if (c.to === "Done" && c.from !== "Done") {
          await notifyFollowers({ ...ctx, agentType, kind: "status_done", excerpt: title })
          if (ctx.rows) await recordUnblocked(ctx, ctx.rows, ctx.rowId)
        }
      } else if (c.kind === "due") {
        await recordWorkspaceActivity({
          docId: ctx.docId,
          credential: ctx.credential,
          agentType,
          action: "database.due_changed",
          summary: c.to ? `Set the due date of “${title}” to ${c.to}` : `Removed the due date of “${title}”`,
          targetType: "database-row",
          targetId: ctx.rowId,
          metadata: { from: c.from, to: c.to },
        })
        await notifyFollowers({ ...ctx, agentType, kind: "due_changed", excerpt: c.to ? `${title} · due ${c.to}` : `${title} · no due date` })
      } else {
        await recordWorkspaceActivity({
          docId: ctx.docId,
          credential: ctx.credential,
          agentType,
          action: "database.owner_changed",
          summary: `Changed the owner of “${title}” from ${personSummary(c.from)} to ${personSummary(c.to)}`,
          targetType: "database-row",
          targetId: ctx.rowId,
          metadata: { from: c.from ? personKey(c.from) : null, to: c.to ? personKey(c.to) : null },
        })
      }
    } catch (e) {
      console.error("[workspace task events]", e)
    }
  }
}

/** Activity for a task created through the UI (REST create logs its own). */
export async function recordRowCreated(ctx: RowCtx): Promise<void> {
  try {
    await recordWorkspaceActivity({
      docId: ctx.docId,
      credential: ctx.credential,
      agentType: ctx.agentType ?? "user",
      action: "database.row_created",
      summary: ctx.title.trim() ? `Created task “${titleOf(ctx.title)}”` : "Created a task",
      targetType: "database-row",
      targetId: ctx.rowId,
    })
  } catch (e) {
    console.error("[workspace task events]", e)
  }
}

/**
 * A new comment: activity, @mention inbox rows, then followers — minus the
 * people the mentions already told (one notice per person per comment).
 */
export async function recordComment(ctx: RowCtx, comment: TaskComment): Promise<void> {
  const agentType = ctx.agentType ?? "user"
  try {
    await recordWorkspaceActivity({
      docId: ctx.docId,
      credential: ctx.credential,
      agentType,
      action: "database.row_commented",
      summary: `Commented on “${titleOf(ctx.title)}”: ${mentionPlainText(comment.text).slice(0, 120)}`,
      targetType: "database-row",
      targetId: ctx.rowId,
      metadata: { commentId: comment.id },
    })
  } catch (e) {
    console.error("[workspace task events]", e)
  }
  const mentioned = await recordCommentMentions({
    docId: ctx.docId,
    rowId: ctx.rowId,
    credential: ctx.credential,
    agentType,
    source: "comment",
    text: comment.text,
  })
  await notifyFollowers({ ...ctx, agentType, kind: "commented", excerpt: comment.text, skip: mentioned })
}
