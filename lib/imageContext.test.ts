import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./deployAuth', () => ({ authedFetch: vi.fn() }))

import { authedFetch } from './deployAuth'
import { imageTextBlocks, parseImageDataUrl, isImageDataUrl } from './imageContext'

const png = { filename: 'shot.png', content: 'data:image/png;base64,QUJDRA==' }
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response

beforeEach(() => vi.mocked(authedFetch).mockReset())

describe('imageContext', () => {
  it('parses a data URL into mime + base64', () => {
    expect(parseImageDataUrl(png.content)).toEqual({ mime: 'image/png', b64: 'QUJDRA==' })
    expect(parseImageDataUrl('data:text/plain;base64,AAAA')).toBeNull()
    expect(isImageDataUrl(png.content)).toBe(true)
    expect(isImageDataUrl('hello')).toBe(false)
  })

  it('inlines the vision description and sends the full image', async () => {
    vi.mocked(authedFetch).mockResolvedValue(ok({ description: 'A landing page' }))
    const [block] = await imageTextBlocks([png], 'lo bisa lihat ini?')
    expect(block).toBe('[Attached image: shot.png]\nA landing page')
    const body = JSON.parse((vi.mocked(authedFetch).mock.calls[0][1] as RequestInit).body as string)
    expect(body).toMatchObject({ mime: 'image/png', data_b64: 'QUJDRA==', caption: 'lo bisa lihat ini?' })
  })

  it('degrades to an honest note when analysis fails', async () => {
    vi.mocked(authedFetch).mockResolvedValue({ ok: false, status: 502, json: async () => ({ detail: 'x' }) } as Response)
    const [block] = await imageTextBlocks([png], '')
    expect(block).toContain('could not be analysed')
    expect(block).not.toContain('A landing page')
  })

  it('rethrows when the user stopped the turn', async () => {
    const ac = new AbortController()
    ac.abort()
    vi.mocked(authedFetch).mockResolvedValue({ ok: false, status: 499, json: async () => ({}) } as Response)
    let caught: unknown = null
    try {
      await imageTextBlocks([png], '', ac.signal)
    } catch (e) {
      caught = e
    }
    expect((caught as Error)?.message).toContain('Image analysis failed')
  })
})
