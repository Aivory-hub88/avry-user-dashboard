import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, type AuthUser } from '@/lib/serverAuth'
import { getFixture, deleteFixture } from '@/lib/workflows/fixtureRepository'

// GET/DELETE /api/workflows/:id/fixtures/:fixtureId — same auth boundary as
// the sibling list/capture route.

export const runtime = 'nodejs'

function authenticate(request: NextRequest): { user: AuthUser } | { response: NextResponse } {
  let user: AuthUser | null
  try {
    user = getAuthUser(request)
  } catch (err) {
    console.error('[api/workflows/fixtures/id] auth misconfiguration:', err)
    return { response: NextResponse.json({ error: 'Fixtures unavailable' }, { status: 500 }) }
  }
  if (!user) {
    return { response: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) }
  }
  return { user }
}

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; fixtureId: string }> }
) {
  const { fixtureId } = await ctx.params
  const auth = authenticate(request)
  if ('response' in auth) return auth.response

  const numericId = parseInt(fixtureId, 10)
  if (!Number.isFinite(numericId)) return NextResponse.json({ error: 'Invalid fixture id' }, { status: 400 })

  try {
    const fixture = await getFixture(numericId)
    if (!fixture) return NextResponse.json({ error: 'Fixture not found' }, { status: 404 })
    return NextResponse.json(fixture)
  } catch (err) {
    console.error(`[GET /api/workflows/.../fixtures/${fixtureId}]`, err)
    return NextResponse.json({ error: 'Fixtures unavailable' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; fixtureId: string }> }
) {
  const { fixtureId } = await ctx.params
  const auth = authenticate(request)
  if ('response' in auth) return auth.response

  const numericId = parseInt(fixtureId, 10)
  if (!Number.isFinite(numericId)) return NextResponse.json({ error: 'Invalid fixture id' }, { status: 400 })

  try {
    await deleteFixture(numericId)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(`[DELETE /api/workflows/.../fixtures/${fixtureId}]`, err)
    return NextResponse.json({ error: 'Fixtures unavailable' }, { status: 500 })
  }
}
