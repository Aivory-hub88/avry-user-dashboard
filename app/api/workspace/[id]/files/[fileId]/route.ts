/**
 * /api/workspace/[id]/files/[fileId] (ADR-019 P0).
 *
 * GET    → { url } presigned download (60 s, attachment), read role.
 * DELETE → soft delete (write role; uploader or doc owner).
 */
import type { NextRequest } from "next/server"
import { downloadFile, removeFile } from "@/lib/workspaceFileHandlers"
import { roomScope } from "@/lib/workspaceFileRoom"

export const runtime = "nodejs"

type Ctx = { params: Promise<{ id: string; fileId: string }> }

export async function GET(req: NextRequest, { params }: Ctx) {
  const { id, fileId } = await params
  return downloadFile(req, id, fileId, roomScope)
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { id, fileId } = await params
  return removeFile(req, id, fileId, roomScope)
}
