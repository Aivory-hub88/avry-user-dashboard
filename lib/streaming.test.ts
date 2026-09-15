/**
 * Stop-contract tests for user-initiated cancellation.
 *
 * A stopped turn must end SILENTLY (partial content kept, no error toast
 * downstream): external abort yields nothing — neither 'done' nor 'error' —
 * while the internal idle-timeout abort keeps yielding its timeout error.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { streamConsoleResponse, typewriterStream } from './streaming'

const MIN_PAYLOAD = {
  session_id: 's',
  organization_id: 'default',
  messages: [{ role: 'user' as const, content: 'hi' }],
}

function sseResponse(lines: string[], hangAfter: boolean): Response {
  const encoder = new TextEncoder()
  let i = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < lines.length) {
        controller.enqueue(encoder.encode(lines[i++]))
        return
      }
      if (!hangAfter) controller.close()
      // hangAfter: never resolve, simulating a stalled server
      return new Promise(() => {})
    },
  })
  return { ok: true, body: stream } as Response
}

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = []
  for await (const ev of gen) out.push(ev)
  return out
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('streamConsoleResponse stop contract', () => {
  it('pre-aborted signal yields nothing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('must not be called')),
    )
    const events = await collect(
      streamConsoleResponse('/x', MIN_PAYLOAD, { signal: AbortSignal.abort() }),
    )
    expect(events).toEqual([])
  })

  it('mid-stream abort ends silently without error', async () => {
    // Faithful mock: like a real fetch, aborting the signal rejects the
    // in-flight body read with an AbortError.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: unknown, init?: { signal?: AbortSignal }) => {
        const signal = init?.signal
        const encoder = new TextEncoder()
        let sent = false
        const stream = new ReadableStream<Uint8Array>({
          pull(controller) {
            if (!sent) {
              sent = true
              controller.enqueue(encoder.encode('data: {"type":"chunk","content":"Hel"}\n'))
              return
            }
            return new Promise((_resolve, reject) => {
              if (signal?.aborted) {
                reject(new DOMException('Aborted', 'AbortError'))
                return
              }
              signal?.addEventListener(
                'abort',
                () => reject(new DOMException('Aborted', 'AbortError')),
                { once: true },
              )
            })
          },
        })
        return Promise.resolve({ ok: true, body: stream } as Response)
      }),
    )
    const controller = new AbortController()
    const gen = streamConsoleResponse('/x', MIN_PAYLOAD, { signal: controller.signal })
    const first = await gen.next()
    expect(first.done).toBe(false)
    controller.abort()
    const rest = await collect(gen)
    expect(rest).toEqual([])
  })

  it('normal completion still yields done', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse(['data: {"type":"chunk","content":"Hi"}\n', 'data: {"type":"done"}\n'], false),
      ),
    )
    const events = await collect(streamConsoleResponse('/x', MIN_PAYLOAD))
    expect(events.some((e: { type?: string }) => e.type === 'done')).toBe(true)
  })
})

describe('typewriterStream stop contract', () => {
  async function* chunks(): AsyncGenerator<{ type: 'chunk'; content: string }> {
    yield { type: 'chunk', content: 'Hello world, this is long enough to animate' }
  }

  it('aborted signal yields nothing, even with pending chunks', async () => {
    const events = await collect(typewriterStream(chunks(), AbortSignal.abort()))
    expect(events).toEqual([])
  })

  it('completes normally without a signal', async () => {
    const events = await collect(typewriterStream(chunks()))
    expect(events.length).toBeGreaterThan(0)
    expect(events[events.length - 1]).toEqual(
      expect.objectContaining({ content: 'Hello world, this is long enough to animate' }),
    )
  })
})
