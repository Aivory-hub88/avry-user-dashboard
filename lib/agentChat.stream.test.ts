import { describe, it, expect, vi, beforeEach } from 'vitest'

const { authedFetch } = vi.hoisted(() => ({ authedFetch: vi.fn() }))
vi.mock('./deployAuth', () => ({ authedFetch }))

import { sendAgentMessage, toolStatusLabel } from './agentChat'

const enc = new TextEncoder()
function sse(...parts: string[]) {
  return {
    ok: true,
    status: 200,
    body: new ReadableStream<Uint8Array>({
      start(c) {
        for (const p of parts) c.enqueue(enc.encode(p))
        c.close()
      },
    }),
  }
}
const blocking = { ok: true, status: 200, json: async () => ({ reply: 'whole', pending_approval: null }) }
const urls = () => authedFetch.mock.calls.map((c) => c[0] as string)

beforeEach(() => authedFetch.mockReset())

describe('sendAgentMessage streaming', () => {
  it('without onDelta it keeps using the blocking route', async () => {
    authedFetch.mockResolvedValue(blocking)
    const r = await sendAgentMessage('autonomous', 'hi', 'c')
    expect(r.reply).toBe('whole')
    expect(urls()).toEqual([expect.stringMatching(/\/agent-chat$/)])
  })

  it('paints the reply as chunks arrive, including a frame split across reads', async () => {
    authedFetch.mockResolvedValue(
      sse(
        'data: {"type":"start"}\n\ndata: {"type":"chunk","content":"Hal"}\n\n',
        'data: {"type":"chunk","content":"o"}\n\n: ping\n\ndata: {"type":"do',
        'ne","pending_approval":{"id":"p1","tool_name":"send_mail","risk_tier":"high"}}\n\n',
      ),
    )
    const seen: string[] = []
    const r = await sendAgentMessage('autonomous', 'hi', 'c', undefined, null, (t) => seen.push(t))
    expect(seen).toEqual(['Hal', 'Halo'])
    expect(r).toEqual({ reply: 'Halo', pendingApproval: { id: 'p1', tool_name: 'send_mail', risk_tier: 'high' } })
    expect(urls()).toEqual([expect.stringMatching(/\/agent-chat\/stream$/)])
  })

  it('falls back to the blocking route when the backend has no streaming route yet', async () => {
    authedFetch.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) }).mockResolvedValueOnce(blocking)
    const onDelta = vi.fn()
    const r = await sendAgentMessage('autonomous', 'hi', 'c', undefined, null, onDelta)
    expect(r.reply).toBe('whole')
    expect(onDelta).not.toHaveBeenCalled()
  })

  it('surfaces a real HTTP error instead of falling back', async () => {
    authedFetch.mockResolvedValue({ ok: false, status: 403, json: async () => ({ detail: 'tier' }) })
    await expect(sendAgentMessage('autonomous', 'hi', 'c', undefined, null, vi.fn())).rejects.toThrow('tier')
    expect(authedFetch).toHaveBeenCalledTimes(1)
  })

  it('an error before any text fails the turn; after some text it keeps the text with a warning', async () => {
    authedFetch.mockResolvedValueOnce(sse('data: {"type":"error","message":"LLM request failed"}\n\n'))
    await expect(sendAgentMessage('autonomous', 'hi', 'c', undefined, null, vi.fn())).rejects.toThrow('LLM request failed')
    authedFetch.mockResolvedValueOnce(
      sse('data: {"type":"chunk","content":"Sebagian"}\n\ndata: {"type":"error","message":"putus"}\n\n'),
    )
    const r = await sendAgentMessage('autonomous', 'hi', 'c', undefined, null, vi.fn())
    expect(r.reply).toBe('Sebagian\n\n⚠️ putus')
  })

  it('reports tool progress while the reply is still empty, and ignores unknown statuses', async () => {
    authedFetch.mockResolvedValue(
      sse(
        'data: {"type":"tool","id":"t1","name":"avry_mail__send_mail","status":"running"}\n\n',
        'data: {"type":"tool","id":"t1","name":"avry_mail__send_mail","status":"done"}\n\n',
        'data: {"type":"tool","id":"t2","name":"x","status":"odd"}\n\n',
        'data: {"type":"chunk","content":"Terkirim"}\n\ndata: {"type":"done","pending_approval":null}\n\n',
      ),
    )
    const tools: unknown[] = []
    const r = await sendAgentMessage('autonomous', 'hi', 'c', undefined, null, vi.fn(), (t) => tools.push(t))
    expect(tools).toEqual([
      { id: 't1', name: 'avry_mail__send_mail', status: 'running' },
      { id: 't1', name: 'avry_mail__send_mail', status: 'done' },
    ])
    expect(r.reply).toBe('Terkirim')
  })

  it('turns an internal tool name into a short status line', () => {
    expect(toolStatusLabel('avry_mail__send_mail')).toBe('Menjalankan send mail…')
    expect(toolStatusLabel('composio__GMAIL-FETCH_EMAILS')).toBe('Menjalankan gmail fetch emails…')
    expect(toolStatusLabel('')).toBe('Menjalankan tool…')
  })
})
