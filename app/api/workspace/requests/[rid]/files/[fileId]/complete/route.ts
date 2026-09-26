/** POST /api/workspace/requests/[rid]/files/[fileId]/complete — verify an attachment upload (ADR-019 P1). */
import type { NextRequest } from "next/server"
import { completeUpload } from "@/lib/workspaceFileHandlers"
import { requestScope } from "@/lib/projectRequestStore"

export const runtime = "nodejs"

export async function POST(req: NextRequest, { params }: { params: Promise<{ rid: string; fileId: string }> }) {
  const { rid, fileId } = await params
  return completeUpload(req, rid, fileId, requestScope)
}
