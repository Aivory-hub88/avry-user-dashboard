import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/console/upload
 *
 * Accepts a single file (multipart/form-data: `file`, `fileName`) attached in the
 * AI Console. The file's readable TEXT is extracted client-side (see
 * `lib/fileExtractor.ts`) and sent inline with the chat message — raw binary is
 * never forwarded to the LLM. This endpoint therefore only validates the upload
 * and returns metadata the dropzone needs: { fileId, fileName, size }.
 */
export const runtime = 'nodejs'

const MAX_BYTES = 15 * 1024 * 1024 // 15 MB

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    const fileName = ((form.get('fileName') as string) || file?.name || 'upload').toString()

    if (!file || typeof file.size !== 'number') {
      return NextResponse.json({ message: 'No file provided' }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { message: `File too large (max ${Math.round(MAX_BYTES / 1024 / 1024)} MB)` },
        { status: 413 },
      )
    }

    const fileId = `file-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

    return NextResponse.json({ fileId, fileName, size: file.size })
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : 'Upload failed' },
      { status: 500 },
    )
  }
}
