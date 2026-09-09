import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { workspaceCredential, unauthorized, forbidden } from "@/lib/workspaceAuth"
import { getDocRole, canWrite } from "@/lib/workspaceAccess"
import { getS3Client, getBucket, getPublicUrl } from "@/lib/s3"
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3"

export const runtime = "nodejs"

const MAX_BYTES = 5 * 1024 * 1024 // 5MB
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"])

function extFromType(t: string) {
  if (t === "image/jpeg") return "jpg"
  if (t === "image/png") return "png"
  if (t === "image/webp") return "webp"
  if (t === "image/gif") return "gif"
  return "bin"
}

// POST /api/workspace/[id]/cover — upload cover image (owner/editor)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const cred = workspaceCredential(req)
  if (!cred) return unauthorized()
  const role = await getDocRole(cred, id)
  if (!canWrite(role)) return forbidden()

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: "invalid form" }, { status: 400 })
  const file = form.get("file") as File | null
  if (!file) return NextResponse.json({ error: "file required" }, { status: 400 })
  if (!ALLOWED.has(file.type)) return NextResponse.json({ error: "only jpg/png/webp/gif" }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "max 5MB" }, { status: 400 })

  const s3 = getS3Client()
  const bucket = getBucket()
  const ext = extFromType(file.type)
  const key = `workspace/${id}/cover-${Date.now().toString(36)}.${ext}`
  const buf = Buffer.from(await file.arrayBuffer())

  try {
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buf, ContentType: file.type }))
  } catch (e) {
    console.error("[cover PUT s3]", e)
    return NextResponse.json({ error: "s3" }, { status: 500 })
  }

  const url = getPublicUrl(key)
  try {
    await query(`UPDATE dashboard.workspace_docs SET cover_url = $2, updated_at = now() WHERE id = $1 OR id = $3`, [`workspace:${id}`, url, id])
  } catch (e) {
    console.error("[cover PUT pg]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
  return NextResponse.json({ ok: true, cover_url: url, key })
}

// DELETE /api/workspace/[id]/cover — clear cover (owner/editor)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const cred = workspaceCredential(req)
  if (!cred) return unauthorized()
  const role = await getDocRole(cred, id)
  if (!canWrite(role)) return forbidden()

  // Optionally delete S3 object — try to parse key from cover_url
  try {
    const r = await query(`SELECT cover_url FROM dashboard.workspace_docs WHERE id = $1 OR id = $2 LIMIT 1`, [`workspace:${id}`, id])
    const url = r.rows[0]?.cover_url as string | null
    if (url) {
      const bucket = getBucket()
      const base = getPublicUrl("")
      // url = https://s3.aivory.uk/workspace-blobs/workspace/id/cover-xxx.jpg
      // key = workspace/id/cover-xxx.jpg
      const idx = url.indexOf(`/${bucket}/`)
      if (idx !== -1) {
        const key = url.slice(idx + bucket.length + 2)
        try {
          const s3 = getS3Client()
          await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
        } catch {}
      }
    }
  } catch {}

  try {
    await query(`UPDATE dashboard.workspace_docs SET cover_url = NULL, updated_at = now() WHERE id = $1 OR id = $3`, [`workspace:${id}`, id])
  } catch (e) {
    console.error("[cover DELETE pg]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
