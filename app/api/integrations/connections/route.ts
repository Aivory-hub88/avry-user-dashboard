import { NextRequest, NextResponse } from 'next/server'
import { listConnections, createConnection } from '@/lib/integrations/store'
import type { CreateConnectionPayload } from '@/types/integrations'

function getTenantId(req: NextRequest): string {
  return req.headers.get('x-tenant-id') ?? 'default'
}

export async function GET(req: NextRequest) {
  const tenantId = getTenantId(req)
  const appId = req.nextUrl.searchParams.get('appId') ?? undefined
  // Never include storageRef in the response
  const connections = listConnections(tenantId, appId).map(({ storageRef: _ref, ...safe }) => safe)
  return NextResponse.json(connections)
}

export async function POST(req: NextRequest) {
  const tenantId = getTenantId(req)

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
