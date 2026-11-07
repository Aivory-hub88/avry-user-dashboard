import { describe, it, expect, vi } from 'vitest'
import { documentMimeFor, precheckDocument, documentErrorMessage, DOCUMENT_MAX_BYTES } from './documentContext'

describe('optional company document', () => {
  it('accepts pdf, docx, txt and md by extension, case-insensitively', () => {
    expect(documentMimeFor('Profile.PDF')).toBe('application/pdf')
    expect(documentMimeFor('a.docx')).toContain('wordprocessingml')
    expect(documentMimeFor('notes.txt')).toBe('text/plain')
    expect(documentMimeFor('readme.md')).toBe('text/markdown')
  })

  it('rejects other types and oversized files before upload', () => {
    expect(documentMimeFor('payload.exe')).toBeNull()
    expect(documentMimeFor('noext')).toBeNull()
    expect(precheckDocument({ name: 'a.exe', size: 10 })).toBe('UNSUPPORTED')
    expect(precheckDocument({ name: 'a.pdf', size: DOCUMENT_MAX_BYTES + 1 })).toBe('TOO_LARGE')
    expect(precheckDocument({ name: 'a.pdf', size: 1000 })).toBeNull()
  })

  it('every failure message tells the user they can continue without a document', () => {
    for (const code of ['TOO_LARGE', 'UNSUPPORTED', 'NO_TEXT', 'UNREADABLE', 'FAILED'] as const) {
      expect(documentErrorMessage(code, 'id')).toMatch(/lanjut tanpa dokumen/)
      expect(documentErrorMessage(code, 'en')).toMatch(/continue without a document/)
    }
  })
})

describe('document-text route', () => {
  const post = async (file: File | null, gateOk = true) => {
    vi.resetModules()
    vi.doMock('@/lib/featureUses', () => ({
      requireRunLeft: async () => (gateOk ? { ok: true } : { ok: false, response: new Response('{}', { status: 402 }) }),
    }))
    const { POST } = await import('../app/api/diagnostics/document-text/route')
    const form = new FormData()
    if (file) form.append('file', file)
    return POST(new Request('http://x/api', { method: 'POST', body: form }) as never)
  }

  it('returns the text of a plain text document', async () => {
    const body = 'Kami menjual kopi dan mesin espresso untuk kafe di seluruh Indonesia. '.repeat(5)
    const res = await post(new File([body], 'profile.txt', { type: 'text/plain' }))
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.text.startsWith('Kami menjual kopi')).toBe(true)
  })

  it('refuses without a run left, an unsupported type, no file, or no readable text', async () => {
    expect((await post(new File(['x'], 'a.txt'), false)).status).toBe(402)
    expect((await post(new File(['x'.repeat(200)], 'a.exe'))).status).toBe(415)
    expect((await post(null)).status).toBe(400)
    const r = await post(new File(['hi'], 'a.txt'))
    expect(r.status).toBe(422)
    expect((await r.json()).code).toBe('NO_TEXT')
  })
})
