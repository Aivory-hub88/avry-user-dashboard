/** /api/workspace/requests/[rid]/files/[fileId] — download / remove an attachment (ADR-019 P1). */
import type { NextRequest } from "next/server"
import { downloadFile, removeFile } from "@/lib/workspaceFileHandlers"
import { requestScope } from "@/lib/projectRequestStore"

export const runtime = "nodejs"

type Ctx = { params: Promise<{ rid: string; fileId: string }> }

export async function GET(req: NextRequest, { params }: Ctx) {
  const { rid, fileId } = await params
  return downloadFile(req, rid, fileId, requestScope)
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { rid, fileId } = await params
  return removeFile(req, rid, fileId, requestScope)
}
