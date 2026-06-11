import { NextResponse } from 'next/server'
import { APP_CATALOG } from '@/lib/integrations/store'

export async function GET() {
  return NextResponse.json(APP_CATALOG)
}
