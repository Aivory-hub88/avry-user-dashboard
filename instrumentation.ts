/**
 * Next.js server start hook. Starts the in-process task due-reminder loop
 * (lib/taskReminders.ts) in the Node server — production by default, or
 * anywhere with TASK_REMINDERS=on; TASK_REMINDERS=off disables it. The
 * reminder pass is idempotent per day, so several containers can run it.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  if (process.env.NEXT_PHASE === "phase-production-build") return
  const flag = process.env.TASK_REMINDERS
  if (flag === "off") return
  if (flag !== "on" && process.env.NODE_ENV !== "production") return
  if (!process.env.DATABASE_URL) return
  const { startTaskReminderLoop } = await import("./lib/taskReminders")
  startTaskReminderLoop()
}
