/**
 * POST /api/workspace/[id]/files/[fileId]/complete — verify an upload (ADR-019 P0).
 * See completeUpload in lib/workspaceFileHandlers.ts for the rules.
 */
import type { NextRequest } from "next/server"
import { completeUpload } from "@/lib/workspaceFileHandlers"
import { roomScope } from "@/lib/workspaceFileRoom"

export const runtime = "nodejs"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const { id, fileId } = await params
  return completeUpload(req, id, fileId, roomScope)
}
