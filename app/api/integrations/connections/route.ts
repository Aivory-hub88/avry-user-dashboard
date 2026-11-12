import { NextRequest, NextResponse } from 'next/server'
import { requirePaidPlan } from '@/lib/planGate'
import { listConnections, createConnection } from '@/lib/integrations/store'
import type { CreateConnectionPayload } from '@/types/integrations'

/**
 * The caller's own tenant, from the verified session (never a client header:
 * an `x-tenant-id` header used to pick anyone's connections, and an absent
 * one shared a single 'default' tenant). Paid plan required.
 */
async function getTenantId(req: NextRequest): Promise<string | Response> {
  const gate = await requirePaidPlan(req, 'integrations')
  return gate.ok ? gate.user.user_id : gate.response
}

export async function GET(req: NextRequest) {
  const tenantId = await getTenantId(req)
  if (typeof tenantId !== 'string') return tenantId
  const appId = req.nextUrl.searchParams.get('appId') ?? undefined
  // Never include storageRef in the response
  const connections = listConnections(tenantId, appId).map(({ storageRef: _ref, ...safe }) => safe)
  return NextResponse.json(connections)
}

export async function POST(req: NextRequest) {
  const tenantId = await getTenantId(req)
  if (typeof tenantId !== 'string') return tenantId

  let body: CreateConnectionPayload
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.appId || !body.displayName || !body.credentials) {
    return NextResponse.json(
      { error: 'appId, displayName, and credentials are required' },
      { status: 400 }
    )
  }

  try {
    const connection = createConnection(tenantId, body)
    // Strip storageRef before returning
    const { storageRef: _ref, ...safe } = connection
    return NextResponse.json(safe, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
