/**
 * POST /api/workspace/[id]/waits/[waitId]/wake — wake an agent's open wait from outside the room
 * (ADR-021 §4.2): a build or deploy webhook, an integration, or a member.
 *
 * Body (optional): { "reason": "build 412 passed" }, quoted to the agent as what woke it.
 *
 * Auth: a member who can write in the room, or the service token (X-Service-Token) for webhooks. The
 * wake is filed as a due reminder under the credential of the member whose turn set the wait, so the
 * backend sweeper (or the room poll) starts the turn with a real member credential; a member's call
 * also fires it right away.
 */
import { NextRequest, NextResponse } from "next/server"
import { getDocRole, canWrite } from "@/lib/workspaceAccess"
import { fireDueReminders } from "@/lib/teamReminders"
import { requestWake } from "@/lib/teamWaits"
import { workspaceCredential, unauthorized, forbidden } from "@/lib/workspaceAuth"

export const runtime = "nodejs"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; waitId: string }> },
) {
  const { id, waitId } = await params
  const credential = workspaceCredential(req)
  if (!credential) return unauthorized()
  if (credential.kind === "user" && !canWrite(await getDocRole(credential, id))) return forbidden()
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(waitId)) return NextResponse.json({ error: "not found" }, { status: 404 })

  const body = (await req.json().catch(() => null)) as { reason?: unknown } | null
  const reason = typeof body?.reason === "string" ? body.reason : ""
  try {
    if (!(await requestWake(id, waitId, reason))) {
      return NextResponse.json({ error: "not found" }, { status: 404 })
    }
    if (credential.kind === "user") {
      fireDueReminders(id, credential).catch((error) => console.error("[workspace wait wake]", error))
    }
    return NextResponse.json({ woken: true }, { status: 202 })
  } catch (error) {
    console.error("[workspace/waits/wake]", error)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}
