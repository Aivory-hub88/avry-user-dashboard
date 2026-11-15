import { NextRequest, NextResponse } from "next/server"
import { workspaceCredential, unauthorized, forbidden } from "@/lib/workspaceAuth"
import { runDueReminders } from "@/lib/taskReminders"

export const runtime = "nodejs"

/**
 * POST /api/workspace/tasks/reminders — run one due-reminder pass now
 * (service token only; the server also runs it every 30 minutes). Safe to
 * call repeatedly: each task/person/kind is sent at most once per day.
 * `{ force: true }` ignores the 08:00 send hour.
 */
export async function POST(req: NextRequest) {
  const cred = workspaceCredential(req)
  if (!cred) return unauthorized()
  if (cred.kind !== "service") return forbidden()
  let force = false
  try {
    const body = (await req.json()) as { force?: unknown }
    force = body.force === true
  } catch {}
  try {
    return NextResponse.json(await runDueReminders(new Date(), { force }))
  } catch (e) {
    console.error("[workspace/tasks/reminders]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}
