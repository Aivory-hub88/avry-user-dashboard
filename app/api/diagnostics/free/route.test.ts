import { beforeEach, describe, expect, it, vi } from 'vitest'

const rows: Array<{ user_id: string; data: unknown }> = []
const tx = vi.fn(async (text: string, params: unknown[] = []) => {
  const uid = params[0] as string
  if (text.includes('pg_advisory_xact_lock')) return { rows: [] }
  if (text.includes('count(*)::int AS used FROM')) return { rows: [{ used: rows.filter(r => r.user_id === uid).length }] }
  if (text.startsWith('INSERT')) { rows.push({ user_id: uid, data: JSON.parse(params[1] as string) }); return { rows: [] } }
  if (text.includes('SELECT data FROM')) {
    const mine = rows.filter(r => r.user_id === uid)
    return { rows: mine.length ? [{ data: mine[mine.length - 1].data }] : [] }
  }
  throw new Error('unexpected sql ' + text)
})

vi.mock('@/lib/db', () => ({
  withTransaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  query: vi.fn(async (_text: string, params: unknown[]) => {
    const mine = rows.filter(r => r.user_id === params[0])
    return { rows: mine.length ? [{ data: mine[mine.length - 1].data, used: mine.length }] : [] }
  }),
}))
vi.mock('@/lib/serverAuth', () => ({ getAuthUser: vi.fn() }))

import { getAuthUser } from '@/lib/serverAuth'
import { QUESTION_SPEC } from '@/lib/freeAnalysis/scoring'
import { GET, POST } from './route'

const answers = Object.fromEntries(QUESTION_SPEC.map(q => [q.id, 3]))
const body = { companyName: 'PT Maju', industry: 'retail', companySize: 'small', answers }
const req = (b?: unknown) => ({ json: async () => b }) as never

describe('/api/diagnostics/free', () => {
  beforeEach(() => {
    rows.length = 0
    vi.mocked(getAuthUser).mockReturnValue({ user_id: 'u1' })
  })

  it('requires a signed-in user', async () => {
    vi.mocked(getAuthUser).mockReturnValue(null)
    expect((await POST(req(body))).status).toBe(401)
    expect((await GET(req())).status).toBe(401)
  })

  it('scores on the server and ignores a client-sent score', async () => {
    const res = await POST(req({ ...body, answers: { ...answers, rework_rate: 0 }, score: 100 }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.result.score).toBe(91)
    expect(json.used).toBe(1)
    expect(json.remaining).toBe(1)
    expect((rows[0].data as { score: number }).score).toBe(91)
  })

  it('rejects an incomplete answer set', async () => {
    const { rework_rate: _x, ...partial } = answers
    expect((await POST(req({ ...body, answers: partial }))).status).toBe(400)
    expect(rows).toHaveLength(0)
  })

  it('allows two runs per account, then answers 429 with the latest result', async () => {
    expect((await POST(req(body))).status).toBe(200)
    expect((await POST(req(body))).status).toBe(200)
    const third = await POST(req(body))
    expect(third.status).toBe(429)
    const json = await third.json()
    expect(json.code).toBe('FREE_ANALYSIS_LIMIT')
    expect(json.remaining).toBe(0)
    expect(json.latest.score).toBe(100)
    expect(rows).toHaveLength(2)

    // Another account still has its own two.
    vi.mocked(getAuthUser).mockReturnValue({ user_id: 'u2' })
    expect((await POST(req(body))).status).toBe(200)
  })

  it('returns the latest result and the count on GET', async () => {
    await POST(req(body))
    const json = await (await GET(req())).json()
    expect(json).toMatchObject({ used: 1, limit: 2, remaining: 1 })
    expect(json.latest.companyName).toBe('PT Maju')
  })
})
