import { NextRequest, NextResponse } from 'next/server'
import {
  getConnection,
  revokeConnection,
  reconnectConnection,
} from '@/lib/integrations/store'

function getTenantId(req: NextRequest): string {
  return req.headers.get('x-tenant-id') ?? 'default'
}

/** PATCH /api/integrations/connections/:id — reconnect with new credentials */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = getTenantId(req)
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
  const tenantId = getTenantId(req)
  const { id } = await params

  if (!getConnection(tenantId, id)) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
  }

  revokeConnection(tenantId, id)
  return new NextResponse(null, { status: 204 })
}
