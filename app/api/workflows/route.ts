import { NextRequest, NextResponse } from 'next/server'
import { workflowRepository } from '@/lib/workflows/repository'
import { AivoryWorkflowSpec } from '@/types/workflow'
import { requireModule } from '@/lib/teamAccess'

// GET /api/workflows — list all workflows
export async function GET(request: NextRequest) {
  const denied = await requireModule(request, 'workflows')
  if (denied) return denied
  try {
    const workflows = workflowRepository.list()
    return NextResponse.json(workflows)
  } catch (err) {
    console.error('[GET /api/workflows]', err)
    return NextResponse.json({ error: 'Failed to list workflows' }, { status: 500 })
  }
}

// POST /api/workflows — create a new workflow
export async function POST(request: NextRequest) {
  const denied = await requireModule(request, 'workflows')
  if (denied) return denied
  try {
    const body = await request.json() as Partial<AivoryWorkflowSpec>

    if (!body.title?.trim()) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 })
    }

    const created = workflowRepository.create({
      title: body.title.trim(),
      status: body.status ?? 'draft',
      source: body.source ?? 'blueprint',
      company_name: body.company_name ?? '',
      trigger: body.trigger ?? '',
      steps: body.steps ?? [],
      integrations: body.integrations ?? [],
      estimated_time: body.estimated_time ?? '',
      automation_percentage: body.automation_percentage ?? '',
      error_handling: body.error_handling,
      notes: body.notes,
      blueprintId: body.blueprintId,
      n8nId: body.n8nId,
      n8n_workflow_id: body.n8n_workflow_id,
      n8n_url: body.n8n_url,
    })

    return NextResponse.json(created, { status: 201 })
  } catch (err) {
    console.error('[POST /api/workflows]', err)
    return NextResponse.json({ error: 'Failed to create workflow' }, { status: 500 })
  }
}
