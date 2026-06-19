import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_SERVICE_URL || "http://avry-backend:8081";

// POST /api/templates/:id/use — increment usage counter
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = request.headers.get("authorization");
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/templates/${id}/use`, {
      method: "POST",
      headers: { Authorization: auth },
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
  }
}
