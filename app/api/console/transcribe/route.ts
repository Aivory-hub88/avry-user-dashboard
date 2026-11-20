import { NextRequest, NextResponse } from 'next/server'
import { requireModule } from '@/lib/teamAccess'

/**
 * POST /api/console/transcribe
 *
 * Speech-to-prompt: forwards a short browser recording (multipart `file`) to the
 * backend's /api/v1/transcribe (Groq Whisper) and returns { text }. The composer
 * drops that text into the input box — nothing is sent to the agent until the
 * user reviews it and presses send.
 */
export const runtime = 'nodejs'

const BACKEND = (
  process.env.BACKEND_SERVICE_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  'http://avry-backend:8081'
).replace(/\/$/, '')

const MAX_BYTES = 20 * 1024 * 1024 // matches the backend's MAX_AUDIO_BYTES

function token(req: NextRequest): string {
  return (
    req.cookies.get('aivory_access_token')?.value ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    ''
  )
}

export async function POST(req: NextRequest) {
  const denied = await requireModule(req, 'console')
  if (denied) return denied

  let file: File | null = null
  try {
    file = (await req.formData()).get('file') as File | null
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }
  if (!file || typeof file.size !== 'number' || file.size === 0) {
    return NextResponse.json({ error: 'No audio provided' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Audio too large' }, { status: 413 })
  }

  const out = new FormData()
  out.append('file', file, file.name || 'voice.webm')

  try {
    const res = await fetch(`${BACKEND}/api/v1/transcribe`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token(req)}` },
      body: out,
      signal: AbortSignal.timeout(45_000),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return NextResponse.json(
        { error: data?.detail || 'Transcription failed' },
        { status: res.status },
      )
    }
    return NextResponse.json({ text: String(data?.text ?? '') })
  } catch {
    return NextResponse.json({ error: 'Transcription unavailable' }, { status: 502 })
  }
}
