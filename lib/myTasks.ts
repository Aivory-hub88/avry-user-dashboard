import { statusGroup, type StatusGroup } from "@/lib/workspaceDbModel"

/**
 * "My tasks" model (client-safe, no server imports): the shape the index
 * endpoint returns, the role tabs and the due-date grouping.
 */

export type MyTaskRole = "assignee" | "owner" | "follower" | "creator"

export type MyTask = {
  docId: string
  rowId: string
  roomTitle: string
  title: string
  status: string
  /** Group of `status` in its room (absent from old responses → legacy meaning). */
  statusGroup?: StatusGroup
  priority: string
  /** YYYY-MM-DD or "" */
  due: string
  roles: MyTaskRole[]
}

export type MyTaskGroup = "Overdue" | "Today" | "This week" | "Later" | "No date"
export const MY_TASK_GROUPS: MyTaskGroup[] = ["Overdue", "Today", "This week", "Later", "No date"]

export const MY_TASK_TABS: Array<{ role: MyTaskRole; label: string }> = [
  { role: "assignee", label: "Assigned to me" },
  { role: "owner", label: "I own" },
  { role: "follower", label: "Following" },
  { role: "creator", label: "Created by me" },
]

/** Local calendar day as YYYY-MM-DD (tasks' due dates are plain days). */
export function localDayISO(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/** Sunday of the week containing `todayISO` (weeks run Monday → Sunday). */
function weekEndISO(todayISO: string): string {
  const d = new Date(`${todayISO}T00:00:00Z`)
  const dow = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() + (6 - dow))
  return d.toISOString().slice(0, 10)
}

export function myTaskGroup(due: string, todayISO: string): MyTaskGroup {
  if (!due) return "No date"
  if (due < todayISO) return "Overdue"
  if (due === todayISO) return "Today"
  if (due <= weekEndISO(todayISO)) return "This week"
  return "Later"
}

/** Tasks for one role tab, grouped by due date (each group sorted by due, then title). */
export function groupMyTasks(tasks: MyTask[], role: MyTaskRole, todayISO: string): Array<{ group: MyTaskGroup; tasks: MyTask[] }> {
  const mine = tasks.filter((t) => t.roles.includes(role))
  return MY_TASK_GROUPS.map((group) => ({
    group,
    tasks: mine
      .filter((t) => myTaskGroup(t.due, todayISO) === group)
      .sort((a, b) => (a.due === b.due ? a.title.localeCompare(b.title) : a.due < b.due ? -1 : 1)),
  })).filter((g) => g.tasks.length > 0)
}

/** Done or canceled in its room. */
export function myTaskClosed(t: Pick<MyTask, "status" | "statusGroup">): boolean {
  const g = t.statusGroup ?? statusGroup([], t.status)
  return g === "done" || g === "canceled"
}

/** Assigned to me or owned by me (the tasks that are on me). */
function onMe(t: MyTask): boolean {
  return t.roles.includes("assignee") || t.roles.includes("owner")
}

/**
 * Tab badge: open tasks on me that are overdue or due today ("waiting on
 * me"). Done tasks never reach the list (the endpoint returns open ones).
 */
export function myTasksBadge(tasks: MyTask[], todayISO: string): number {
  return tasks.filter((t) => onMe(t) && !myTaskClosed(t) && !!t.due && t.due <= todayISO).length
}

/** The Console "Today" card: overdue first, then due today (max `max`). */
export function todayTasks(tasks: MyTask[], todayISO: string, max = 5): MyTask[] {
  return tasks
    .filter((t) => onMe(t) && !myTaskClosed(t) && !!t.due && t.due <= todayISO)
    .sort((a, b) => (a.due === b.due ? a.title.localeCompare(b.title) : a.due < b.due ? -1 : 1))
    .slice(0, max)
}

/** Link that opens the task's drawer in its room. */
export function myTaskHref(t: Pick<MyTask, "docId" | "rowId">): string {
  return `/workspace/${encodeURIComponent(t.docId)}?tab=tasks&task=${encodeURIComponent(t.rowId)}`
}
