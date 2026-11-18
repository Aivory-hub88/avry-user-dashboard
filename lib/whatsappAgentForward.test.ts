import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { offerToAgent, withoutAgentMessages } from './whatsappAgentForward'
import { parseInbound } from './kapso'
import type { Inbound } from './whatsapp/types'

const msg = (o: Partial<Inbound> = {}): Inbound => ({ id: 'wamid.1', from: '6281234567890', name: 'Maya', text: 'Halo', at: '2024-10-28T05:20:00.000Z', ...o })
const answer = (status: unknown, code = 200) => vi.fn(async () => new Response(JSON.stringify({ status }), { status: code })) as unknown as typeof fetch

describe('offerToAgent', () => {
  beforeEach(() => { process.env.DASHBOARD_AGENT_TURN_TOKEN = 'tok' })
  afterEach(() => { delete process.env.DASHBOARD_AGENT_TURN_TOKEN })

  it('sends the message with the shared secret and returns the backend verdict', async () => {
    const f = answer('handled')
    expect(await offerToAgent(msg({ kind: 'audio', mediaId: 'm9', mime: 'audio/ogg; codecs=opus' }), f)).toBe('handled')
    const [url, init] = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]
    expect(url).toMatch(/\/api\/v1\/whatsapp\/inbound$/)
    expect((init.headers as Record<string, string>)['x-agent-turn-token']).toBe('tok')
    expect(JSON.parse(String(init.body))).toMatchObject({ message_id: 'wamid.1', from: '6281234567890', type: 'audio', media_id: 'm9', mime_type: 'audio/ogg; codecs=opus' })
  })

  it('treats text as type "text" and passes duplicate through', async () => {
    const f = answer('duplicate')
    expect(await offerToAgent(msg(), f)).toBe('duplicate')
    expect(JSON.parse(String((f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0][1].body)).type).toBe('text')
  })

  it('fails open to the CRM when the backend errors, times out, or answers nonsense', async () => {
    expect(await offerToAgent(msg(), answer('handled', 503))).toBe('not_handled')
    expect(await offerToAgent(msg(), vi.fn(async () => { throw new Error('down') }) as unknown as typeof fetch)).toBe('not_handled')
    expect(await offerToAgent(msg(), answer('???'))).toBe('not_handled')
  })

  it('skips the call entirely when the shared secret is not configured', async () => {
    delete process.env.DASHBOARD_AGENT_TURN_TOKEN
    const f = answer('handled')
    expect(await offerToAgent(msg(), f)).toBe('not_handled')
    expect(f).not.toHaveBeenCalled()
  })
})

describe('withoutAgentMessages', () => {
  beforeEach(() => { process.env.DASHBOARD_AGENT_TURN_TOKEN = 'tok' })
  afterEach(() => { delete process.env.DASHBOARD_AGENT_TURN_TOKEN })

  it('keeps only the messages no agent took, so a bound chat never reaches the CRM', async () => {
    const verdicts = ['handled', 'not_handled', 'duplicate']
    let i = 0
    const f = vi.fn(async () => new Response(JSON.stringify({ status: verdicts[i++] }))) as unknown as typeof fetch
    const out = await withoutAgentMessages([msg({ id: 'a' }), msg({ id: 'b' }), msg({ id: 'c' })], f)
    expect(out.map((m) => m.id)).toEqual(['b'])
  })
})

describe('parseInbound media fields', () => {
  const received = (o: Record<string, unknown>) => ({
    message: { id: 'wamid.7', timestamp: '1730092800', from: '6281234567890', kapso: { direction: 'inbound' }, ...o },
    conversation: { contact_name: 'Maya', phone_number: '6281234567890' },
  })
  it('carries the media id and mime type of a voice note', () => {
    const [m] = parseInbound(received({ type: 'audio', audio: { id: 'media-1', mime_type: 'audio/ogg; codecs=opus', voice: true } }))
    expect(m).toMatchObject({ kind: 'audio', mediaId: 'media-1', mime: 'audio/ogg; codecs=opus', text: '(audio)' })
  })
  it('carries a document filename and leaves plain text without media fields', () => {
    const [d] = parseInbound(received({ type: 'document', document: { id: 'd1', mime_type: 'application/pdf', filename: 'inv.pdf' } }))
    expect(d).toMatchObject({ kind: 'document', mediaId: 'd1', filename: 'inv.pdf' })
    const [t] = parseInbound(received({ type: 'text', text: { body: 'Halo' } }))
    expect(t.kind).toBeUndefined()
    expect(t.mediaId).toBeUndefined()
  })
})
