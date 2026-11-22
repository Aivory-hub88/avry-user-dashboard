import { beforeEach, describe, expect, it, vi } from "vitest"

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }))
vi.mock("@/lib/db", () => ({ query: queryMock }))

import { canManageDoc, getDocRole } from "@/lib/workspaceAccess"

const user = (id: string) => ({ kind: "user", user: { user_id: id, account_type: "user" } }) as never

beforeEach(() => queryMock.mockReset())

describe("room admin (per-room grant)", () => {
  it("lets the owner manage without checking grants", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [{}] })
    expect(await canManageDoc("r1", "user", "owner")).toBe(true)
    expect(queryMock).toHaveBeenCalledTimes(1)
  })

  it("lets an admin grant manage, but not an editor or stranger", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] }).mockResolvedValueOnce({ rowCount: 1, rows: [{}] })
    expect(await canManageDoc("r1", "user", "u-admin")).toBe(true)
    expect(String(queryMock.mock.calls[1][0])).toContain("role = 'admin'")
    queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] }).mockResolvedValueOnce({ rowCount: 0, rows: [] })
    expect(await canManageDoc("r1", "user", "u-editor")).toBe(false)
  })

  it("treats an admin grant as editor access for everything else", async () => {
    queryMock.mockImplementation(async (sql?: string) => {
      sql = String(sql ?? "")
      if (sql.includes("FROM dashboard.workspace_docs")) return { rows: [{ id: "workspace:r1", owner: "o", workspace_id: "default" }] }
      if (sql.includes("workspace_doc_acl")) return { rows: [{ doc_id: "r1", role: "admin" }] }
      return { rows: [] }
    })
    expect(await getDocRole(user("u-admin"), "r1")).toBe("editor")
  })
})
