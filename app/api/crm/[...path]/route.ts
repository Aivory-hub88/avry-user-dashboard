/**
 * CRM proxy. The browser never talks to avry-crm: this route authenticates
 * the dashboard user, then calls the CRM server-side with the shared service
 * token and the user's id as the tenant. The tenant always comes from the
 * verified JWT — any x-tenant-id the client sends is ignored.
 */
import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/serverAuth"
import { isAllowedCrmPath } from "@/lib/crmPaths"

export const runtime = "nodejs"

type Ctx = { params: Promise<{ path: string[] }> }

async function proxy(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const user = getAuthUser(req)
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { path } = await ctx.params
  if (!isAllowedCrmPath(path, req.method)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  const base = process.env.CRM_URL || "http://avry-crm:8091"
  const token = process.env.CRM_SERVICE_TOKEN
  if (!token) return NextResponse.json({ error: "crm_not_configured" }, { status: 503 })

  const hasBody = req.method === "POST" || req.method === "PATCH"
  try {
    const upstream = await fetch(`${base}/${path.join("/")}${req.nextUrl.search}`, {
      method: req.method,
      headers: {
        "content-type": "application/json",
        "x-service-token": token,
        "x-tenant-id": user.user_id,
      },
      body: hasBody ? await req.text() : undefined,
      signal: AbortSignal.timeout(10_000),
    })
    // The CRM rejecting our own service token is a deployment fault, not the user's.
    if (upstream.status === 401) return NextResponse.json({ error: "crm_unavailable" }, { status: 502 })
    const text = await upstream.text()
    return new NextResponse(text, {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
    })
  } catch {
    return NextResponse.json({ error: "crm_unavailable" }, { status: 502 })
  }
}

export { proxy as GET, proxy as POST, proxy as PATCH, proxy as DELETE }
