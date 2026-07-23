import { NextRequest, NextResponse } from 'next/server'
import { canvasRepository } from '@/lib/workflows/canvasRepository'

// GET/PUT/DELETE /api/workflows/:id/canvas — React Flow nodes/edges for a
// workflow's draft canvas. canvasRepository was entirely dead code (zero
// callers, .data/canvas_states.json never even created on disk) — the
// client (hooks/useCanvasPersistence.ts) has been targeting these exact
// routes the whole time; every call 404'd silently, masked by the
// localStorage fallback in loadCanvasState()/writeLocalStorage().

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params
  try {
    const state = canvasRepository.get(id)
    return NextResponse.json(state)
  } catch (err) {
    console.error(`[GET /api/workflows/${id}/canvas]`, err)
    return NextResponse.json({ error: 'Failed to fetch canvas state' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params
  let body: { nodes?: unknown[]; edges?: unknown[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!Array.isArray(body.nodes) || !Array.isArray(body.edges)) {
    return NextResponse.json({ error: 'nodes and edges arrays are required' }, { status: 400 })
  }

  try {
    const state = canvasRepository.set(id, body.nodes as any, body.edges as any)
    return NextResponse.json(state)
  } catch (err) {
    console.error(`[PUT /api/workflows/${id}/canvas]`, err)
    return NextResponse.json({ error: 'Failed to save canvas state' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params
  try {
    canvasRepository.remove(id)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(`[DELETE /api/workflows/${id}/canvas]`, err)
    return NextResponse.json({ error: 'Failed to delete canvas state' }, { status: 500 })
  }
}
