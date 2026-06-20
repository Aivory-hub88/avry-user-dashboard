import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_SERVICE_URL || "http://avry-backend:8081";

// GET /api/agent-catalog — published agents from the shared backend.
export async function GET(request: NextRequest) {
  const token =
    request.cookies.get("aivory_access_token")?.value ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json([], { status: 200 });
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/agent-catalog?status=published`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const data = await res.json().catch(() => []);
    return NextResponse.json(Array.isArray(data) ? data : [], { status: res.ok ? 200 : res.status });
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
