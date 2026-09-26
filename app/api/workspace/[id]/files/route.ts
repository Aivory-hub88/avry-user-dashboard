/**
 * /api/workspace/[id]/files — room files on R2 (ADR-019 P0).
 *
 * GET  → list ready/ingested files of the room (read role).
 * POST { name, mime, size } → pending row + presigned PUT (write role).
 *      The browser PUTs the bytes to R2 itself with header Content-Type =
 *      the declared mime, then calls POST .../files/[fileId]/complete.
 */
import type { NextRequest } from "next/server"
import { listFiles, createUpload } from "@/lib/workspaceFileHandlers"
import { roomScope } from "@/lib/workspaceFileRoom"

export const runtime = "nodejs"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Ctx) {
  return listFiles(req, (await params).id, roomScope)
}

export async function POST(req: NextRequest, { params }: Ctx) {
  return createUpload(req, (await params).id, roomScope)
}
