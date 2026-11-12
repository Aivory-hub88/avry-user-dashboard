/**
 * Free Business Operations Analysis, per account.
 *
 * GET  /api/diagnostics/free → { latest, used, limit, remaining }
 * POST /api/diagnostics/free  { companyName, industry, companySize, answers }
 *      → 200 { result, ...status } | 400 invalid | 429 FREE_ANALYSIS_LIMIT
 *
 * The score is recomputed here from the raw answers (lib/freeAnalysis/scoring),
 * never taken from the client. No LLM is called. user_id comes only from the
 * verified JWT. Open to every signed-in account: the free analysis is the one
 * diagnostic a free account can run.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/serverAuth'
import { parseFreeAnalysisInput, scoreFreeAnalysis } from '@/lib/freeAnalysis/scoring'
import { getFreeAnalysisStatus, recordFreeAnalysis } from '@/lib/freeAnalysis/store'

export const runtime = 'nodejs'

function userIdOf(request: NextRequest): string | NextResponse {
  try {
    const user = getAuthUser(request)
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    return user.user_id
  } catch (err) {
    console.error('[api/diagnostics/free] auth misconfiguration:', err)
    return NextResponse.json({ error: 'Storage unavailable' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const uid = userIdOf(request)
  if (typeof uid !== 'string') return uid
  try {
    return NextResponse.json(await getFreeAnalysisStatus(uid))
  } catch (err) {
    console.error('[api/diagnostics/free] GET failed:', err)
    return NextResponse.json({ error: 'Storage unavailable' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const uid = userIdOf(request)
  if (typeof uid !== 'string') return uid

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const input = parseFreeAnalysisInput(body)
  if (!input) return NextResponse.json({ error: 'Incomplete analysis' }, { status: 400 })

  const result = scoreFreeAnalysis(input, new Date())
  try {
    const saved = await recordFreeAnalysis(uid, result)
    if (!saved.ok) {
      return NextResponse.json(
        { error: 'You have used all your free analyses', code: 'FREE_ANALYSIS_LIMIT', ...saved.status },
        { status: 429 },
      )
    }
    return NextResponse.json({ result, ...saved.status })
  } catch (err) {
    console.error('[api/diagnostics/free] POST failed:', err)
    return NextResponse.json({ error: 'Storage unavailable' }, { status: 500 })
  }
}
