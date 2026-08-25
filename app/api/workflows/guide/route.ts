import { NextRequest, NextResponse } from 'next/server'
import { generateSetupGuideMarkdown, type GuideStep } from '@/lib/workflows/nodeSetupGuide'
import { mdToText, mdToPdf } from '@/lib/workflows/guideFormats'

export const maxDuration = 30

/**
 * POST /api/workflows/guide
 * Body: { workflowName: string, steps: GuideStep[], summary?: string }
 * Returns: text/markdown attachment (Setup Guide per node).
 * Deterministic — no LLM call; curated knowledge base per app/node type.
 */
export async function POST(request: NextRequest) {
  let body: { workflowName?: string; steps?: GuideStep[]; summary?: string; format?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 })
  }

  const workflowName =
    typeof body?.workflowName === 'string' && body.workflowName.trim()
      ? body.workflowName.trim().slice(0, 120)
      : 'Workflow'
  const steps = Array.isArray(body?.steps) ? body.steps : []

  if (!steps.length) {
    return NextResponse.json(
      { message: 'steps is required and must be a non-empty array' },
      { status: 400 }
    )
  }

  const fmt = body?.format === 'txt' || body?.format === 'pdf' || body?.format === 'md' ? body.format : 'md'
  const md = generateSetupGuideMarkdown(workflowName, steps, body?.summary)
  const filename = `${workflowName.replace(/[^a-zA-Z0-9-_ ]/g, '').trim().replace(/\s+/g, '-') || 'workflow'}-setup-guide.md`

  const base = filename.replace(/\.md$/, "")
  const ext = fmt === 'txt' ? 'txt' : fmt
  const ctype = fmt === 'pdf' ? 'application/pdf' : fmt === 'txt' ? 'text/plain; charset=utf-8' : 'text/markdown; charset=utf-8'
  const payload = fmt === 'pdf' ? mdToPdf(md) : fmt === 'txt' ? mdToText(md) : md
  return new NextResponse(payload as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': ctype,
      'Content-Disposition': `attachment; filename="${base}.${ext}"`,
    },
  })
}
