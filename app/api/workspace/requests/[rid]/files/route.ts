/** /api/workspace/requests/[rid]/files — attachments while drafting (ADR-019 P1). Same contract as room files. */
import type { NextRequest } from "next/server"
import { listFiles, createUpload } from "@/lib/workspaceFileHandlers"
import { requestScope } from "@/lib/projectRequestStore"

export const runtime = "nodejs"

type Ctx = { params: Promise<{ rid: string }> }

export async function GET(req: NextRequest, { params }: Ctx) {
  return listFiles(req, (await params).rid, requestScope)
}

export async function POST(req: NextRequest, { params }: Ctx) {
  return createUpload(req, (await params).rid, requestScope)
}
