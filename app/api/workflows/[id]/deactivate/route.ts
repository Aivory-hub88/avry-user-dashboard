import { NextRequest, NextResponse } from 'next/server'
import { workflowRepository } from '@/lib/workflows/repository'

// POST /api/workflows/:id/deactivate — flips Aivory's own `status` back to
// 'draft'. This route didn't exist at all before; handleDeactivate()
// (app/workflows/page.tsx) actively calls it today and surfaces the 404 as
// a real error toast (unlike other silently-swallowed gaps in this area).
// Scoped to Aivory's own status field only — does NOT also deactivate the
// live n8n workflow (that's a separate concern via app/api/n8n/workflow/[id],
// which is user-credential-scoped; this route matches the existing
// local-fallback behavior in handleDeactivate's else-branch, just made to
// actually persist server-side instead of only in localStorage).

export async function POST(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params
  try {
    const updated = workflowRepository.update(id, { status: 'draft' })
    if (!updated) return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })
    return NextResponse.json(updated)
  } catch (err) {
    console.error(`[POST /api/workflows/${id}/deactivate]`, err)
    return NextResponse.json({ error: 'Failed to deactivate workflow' }, { status: 500 })
  }
}
