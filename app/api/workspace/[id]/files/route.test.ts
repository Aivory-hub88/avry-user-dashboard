/**
 * Room files on R2 (ADR-019 P0): ACL gates, presign, complete verification.
 * R2 is mocked — no network. getDocRolesBatch is driven through queryMock.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const { queryMock, authMock, r2 } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  authMock: vi.fn<(...args: unknown[]) => unknown>(() => null),
  r2: {
    presignPut: vi.fn(async () => "https://r2.example/put"),
    presignGet: vi.fn(async () => "https://r2.example/get"),
    headObject: vi.fn(async (): Promise<{ size: number; mime: string } | null> => null),
    deleteObject: vi.fn(async () => {}),
    r2Configured: vi.fn(() => true),
  },
}))

vi.mock("@/lib/db", () => ({ query: queryMock }))
vi.mock("@/lib/serverAuth", () => ({ getAuthUserWithToken: () => authMock() }))
vi.mock("@/lib/r2", () => ({ ...r2, R2_TTL: { put: 300, get: 60 } }))

import { GET as LIST, POST as CREATE } from "./route"
import { GET as DOWNLOAD, DELETE as REMOVE } from "./[fileId]/route"
import { POST as COMPLETE } from "./[fileId]/complete/route"

const USER = { user: { user_id: "u1", email: "rina@x.id", account_type: "member" }, token: "jwt-1" }

const fileRow = (over: Record<string, unknown> = {}) => ({
  id: "f1",
  room_id: "room-1",
  request_id: null,
  key: "ws/default/room/room-1/f1/SOP.pdf",
  name: "SOP.pdf",
  mime: "application/pdf",
  size: 2048,
  status: "pending",
  uploaded_by: "user:u1",
  created_at: "2026-09-26T10:00:00.000Z",
  ...over,
})

/**
 * role = the caller's workspace-member role for room-1 (null = member of
 * nothing). room = how room-1 exists: owned (normal), missing or ownerless
 * (both "claimable" to getDocRolesBatch, so files must refuse them).
 */
function setup(
  role: "owner" | "editor" | "viewer" | null,
  file: Record<string, unknown> | null = null,
  room: "owned" | "missing" | "ownerless" | "trashed" = "owned",
) {
  const owner = room === "ownerless" ? null : role === "owner" ? "u1" : "someone"
  const docRows =
    room === "missing"
      ? []
      : [{ id: "room-1", workspace_id: "default", owner, deleted_at: room === "trashed" ? "2026-09-25T00:00:00Z" : null }]
  queryMock.mockImplementation((sql: string) => {
    if (sql.includes("workspace_members"))
      return Promise.resolve({ rows: role && role !== "owner" ? [{ workspace_id: "default", role }] : [] })
    if (sql.includes("workspace_doc_acl")) return Promise.resolve({ rows: [] })
    if (sql.includes("FROM dashboard.workspace_docs")) return Promise.resolve({ rows: docRows })
    if (sql.startsWith("INSERT INTO dashboard.workspace_files"))
      return Promise.resolve({ rows: [fileRow()] })
    if (sql.includes("FROM dashboard.workspace_files")) return Promise.resolve({ rows: file ? [file] : [] })
    if (sql.startsWith("UPDATE dashboard.workspace_files"))
      return Promise.resolve({ rows: file ? [{ ...file, status: "ready" }] : [] })
    return Promise.resolve({ rows: [] })
  })
}

const ctx = { params: Promise.resolve({ id: "room-1" }) }
const fctx = { params: Promise.resolve({ id: "room-1", fileId: "f1" }) }
const req = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/api/workspace/room-1/files", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

beforeEach(() => {
  vi.clearAllMocks()
  authMock.mockReturnValue(USER)
  r2.r2Configured.mockReturnValue(true)
})

describe("POST files (presign)", () => {
  const body = { name: "SOP.pdf", mime: "application/pdf", size: 2048 }

  it("401 without a session", async () => {
    authMock.mockReturnValue(null)
    setup("editor")
    expect((await CREATE(req("POST", body), ctx)).status).toBe(401)
  })

  it("403 for a viewer and never presigns", async () => {
    setup("viewer")
    expect((await CREATE(req("POST", body), ctx)).status).toBe(403)
    expect(r2.presignPut).not.toHaveBeenCalled()
  })

  it("403 for a non-member", async () => {
    setup(null)
    expect((await CREATE(req("POST", body), ctx)).status).toBe(403)
  })

  it.each(["missing", "ownerless", "trashed"] as const)("404 when the room is %s (claimable ids never get storage)", async (room) => {
    setup(room === "trashed" ? "editor" : null, null, room)
    expect((await CREATE(req("POST", body), ctx)).status).toBe(404)
    expect(r2.presignPut).not.toHaveBeenCalled()
  })

  it("400 on a disallowed type", async () => {
    setup("editor")
    const r = await CREATE(req("POST", { ...body, mime: "text/html", name: "x.html" }), ctx)
    expect(r.status).toBe(400)
  })

  it("503 when R2 isn't configured", async () => {
    setup("editor")
    r2.r2Configured.mockReturnValue(false)
    expect((await CREATE(req("POST", body), ctx)).status).toBe(503)
  })

  it("201 for an editor: pending row + signed PUT with the declared type", async () => {
    setup("editor")
    const r = await CREATE(req("POST", body), ctx)
    expect(r.status).toBe(201)
    const j = await r.json()
    expect(j.upload).toMatchObject({ url: "https://r2.example/put", method: "PUT", headers: { "Content-Type": "application/pdf" } })
    expect(j.file.status).toBe("pending")
    const [key, mime] = r2.presignPut.mock.calls[0] as unknown as [string, string]
    expect(key).toMatch(/^ws\/default\/room\/room-1\/[0-9a-f-]{36}\/SOP\.pdf$/)
    expect(mime).toBe("application/pdf")
  })
})

describe("POST complete", () => {
  it("ready when size and type match", async () => {
    setup("editor", fileRow())
    r2.headObject.mockResolvedValue({ size: 2048, mime: "application/pdf" })
    const r = await COMPLETE(req("POST"), fctx)
    expect(r.status).toBe(200)
    expect((await r.json()).file.status).toBe("ready")
    expect(r2.deleteObject).not.toHaveBeenCalled()
  })

  it("422 + object deleted when the size differs", async () => {
    setup("editor", fileRow())
    r2.headObject.mockResolvedValue({ size: 9999, mime: "application/pdf" })
    expect((await COMPLETE(req("POST"), fctx)).status).toBe(422)
    expect(r2.deleteObject).toHaveBeenCalledWith("ws/default/room/room-1/f1/SOP.pdf")
  })

  it("409 when the bytes haven't arrived", async () => {
    setup("editor", fileRow())
    r2.headObject.mockResolvedValue(null)
    expect((await COMPLETE(req("POST"), fctx)).status).toBe(409)
  })

  it("403 when someone else uploaded it", async () => {
    setup("editor", fileRow({ uploaded_by: "user:other" }))
    expect((await COMPLETE(req("POST"), fctx)).status).toBe(403)
    expect(r2.headObject).not.toHaveBeenCalled()
  })
})

describe("GET download", () => {
  it("viewer gets a presigned URL for a ready file", async () => {
    setup("viewer", fileRow({ status: "ready" }))
    const r = await DOWNLOAD(req("GET"), fctx)
    expect(r.status).toBe(200)
    expect((await r.json()).url).toBe("https://r2.example/get")
  })

  it("404 for a pending file", async () => {
    setup("viewer", fileRow())
    expect((await DOWNLOAD(req("GET"), fctx)).status).toBe(404)
  })

  it("403 for a non-member, no URL issued", async () => {
    setup(null, fileRow({ status: "ready" }))
    expect((await DOWNLOAD(req("GET"), fctx)).status).toBe(403)
    expect(r2.presignGet).not.toHaveBeenCalled()
  })
})

describe("GET list / DELETE", () => {
  it("lists for a viewer", async () => {
    setup("viewer", fileRow({ status: "ready" }))
    const r = await LIST(req("GET"), ctx)
    expect(r.status).toBe(200)
    expect((await r.json()).files).toHaveLength(1)
  })

  it("editor can't delete someone else's file", async () => {
    setup("editor", fileRow({ status: "ready", uploaded_by: "user:other" }))
    expect((await REMOVE(req("DELETE"), fctx)).status).toBe(403)
  })

  it("owner can delete any file", async () => {
    setup("owner", fileRow({ status: "ready", uploaded_by: "user:other" }))
    expect((await REMOVE(req("DELETE"), fctx)).status).toBe(200)
  })
})
