/**
 * POST /api/workspace/[id]/reminders/fire — fire this member's due agent reminders in a room
 * (ADR-021 §4.1).
 *
 * Called by the avry-backend reminder sweeper with a short-lived token it minted for the member whose
 * turn set the reminder (`credential_owner`), so reminders fire with nobody in the room. The token is
 * verified like any request, and the member must still be able to write in the room. Only that member's
 * reminders fire here; the room poll (timeline GET) still fires every due reminder as before. The turns
 * start fire-and-forget, so this answers right away.
 */
import { NextRequest, NextResponse } from "next/server"
import { getDocRole, canWrite } from "@/lib/workspaceAccess"
import { fireDueReminders } from "@/lib/teamReminders"
import { workspaceCredential, unauthorized, forbidden } from "@/lib/workspaceAuth"

export const runtime = "nodejs"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const credential = workspaceCredential(req)
  if (!credential) return unauthorized()
  // An agent turn needs a member's own credential; the service token has none.
  if (credential.kind !== "user") return forbidden()
  if (!canWrite(await getDocRole(credential, id))) return forbidden()
  try {
    const fired = await fireDueReminders(id, credential, { owner: credential.user.user_id })
    return NextResponse.json({ fired })
  } catch (error) {
    console.error("[workspace/reminders/fire]", error)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}
