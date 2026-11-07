import { NextRequest, NextResponse } from 'next/server'
import { requireRunLeft } from '@/lib/featureUses'
import { extractText } from '@/lib/roomFileText'
import { DOCUMENT_MAX_BYTES, DOCUMENT_MAX_CHARS, documentMimeFor } from '@/lib/documentContext'

// Optional company document for the Deep Diagnostic. Text only comes back; the file itself is never stored.
export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(request: NextRequest) {
  // Same gate as starting a diagnostic: the caller must be signed in and have a run left.
  const gate = await requireRunLeft(request, 'snapshot')
  if (!gate.ok) return gate.response

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ message: 'Invalid upload' }, { status: 400 })
  }
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ message: 'No file' }, { status: 400 })
  if (file.size > DOCUMENT_MAX_BYTES) return NextResponse.json({ message: 'File too large', code: 'TOO_LARGE' }, { status: 413 })

  const mime = documentMimeFor(file.name)
  if (!mime) return NextResponse.json({ message: 'Unsupported file type', code: 'UNSUPPORTED' }, { status: 415 })

  try {
    const raw = await extractText(new Uint8Array(await file.arrayBuffer()), mime)
    const text = raw.replace(/\s+/g, ' ').trim().slice(0, DOCUMENT_MAX_CHARS)
    if (text.length < 80) return NextResponse.json({ message: 'No readable text', code: 'NO_TEXT' }, { status: 422 })
    return NextResponse.json({ text, chars: text.length })
  } catch {
    return NextResponse.json({ message: 'Could not read the file', code: 'UNREADABLE' }, { status: 422 })
  }
}
