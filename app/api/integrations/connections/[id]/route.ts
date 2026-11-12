import { NextRequest, NextResponse } from 'next/server'
import { requirePaidPlan } from '@/lib/planGate'
import {
  getConnection,
  revokeConnection,
  reconnectConnection,
} from '@/lib/integrations/store'

/**
 * The caller's own tenant, from the verified session (never a client header:
 * an `x-tenant-id` header used to pick anyone's connections, and an absent
 * one shared a single 'default' tenant). Paid plan required.
 */
async function getTenantId(req: NextRequest): Promise<string | Response> {
  const gate = await requirePaidPlan(req, 'integrations')
  return gate.ok ? gate.user.user_id : gate.response
}

/** PATCH /api/integrations/connections/:id — reconnect with new credentials */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = await getTenantId(req)
  if (typeof tenantId !== 'string') return tenantId
  const { id } = await params

  if (!getConnection(tenantId, id)) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
  }

  let body: { credentials: Record<string, string> }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.credentials || typeof body.credentials !== 'object') {
    return NextResponse.json({ error: 'credentials required' }, { status: 400 })
  }

  const updated = reconnectConnection(tenantId, id, body.credentials)
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { storageRef: _ref, ...safe } = updated
  return NextResponse.json(safe)
}

/** DELETE /api/integrations/connections/:id — revoke (soft delete, purges credentials) */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = await getTenantId(req)
  if (typeof tenantId !== 'string') return tenantId
  const { id } = await params

  if (!getConnection(tenantId, id)) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
  }

  revokeConnection(tenantId, id)
  return new NextResponse(null, { status: 204 })
}
