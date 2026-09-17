/**
 * POST /api/workspace/roadmap-import (Phase 4): fixture 3 waves / 11 rows.
 * Fake workspace_docs table + Y.Doc sungguhan via mocked loadDbDoc/saveDbDoc.
 * import 2× tanpa duplikat; doc diubah user → conflict (currentContent+history).
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import * as Y from "yjs"

const { queryMock, ydocs } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  ydocs: new Map<string, Y.Doc>(),
}))

vi.mock("@/lib/db", () => ({
  query: queryMock,
  withTransaction: async (fn: (tx: (sql: string) => Promise<{ rows: unknown[] }>) => Promise<unknown>) =>
    fn(async (sql: string) =>
      sql.includes("INSERT INTO dashboard.workspace_events")
        ? { rows: [{ id: 1, created_at: "2026-01-01 00:00:00+00", payload: "{}" }] }
        : { rows: [] },
    ),
}))
vi.mock("@/lib/serverAuth", () => ({ getAuthUserWithToken: () => null }))
vi.mock("@/lib/workspaceDb", async (importOriginal) => {
  const orig = (await importOriginal()) as Record<string, unknown>
  return {
    ...orig,
    loadDbDoc: async (id: string) => {
      const bare = String(id).replace(/^workspace:/, "")
      if (!ydocs.has(bare)) ydocs.set(bare, new Y.Doc())
      return ydocs.get(bare)!
    },
    saveDbDoc: async () => {},
  }
})

import { POST } from "./route"

process.env.COLLAB_SERVICE_TOKEN = "test-service-token"

const svc = { "x-service-token": "test-service-token" }

type FakeDoc = { id: string; title: string; props: Record<string, unknown>; updated_at: string }
let fakeDocs: FakeDoc[]

const ROADMAP = {
  id: "rm-1",
  title: "Transformasi Toko",
  phases: [
    {
      id: "w1",
      name: "Fondasi",
      timeframe: "Bulan 1",
      description: "",
      milestones: [
        { id: "m1", title: "Setup" },
        { id: "m2", title: "Akun" },
        { id: "m3", title: "Audit" },
      ],
    },
    {
      id: "w2",
      name: "Operasi",
      timeframe: "Bulan 2",
      description: "",
      milestones: [
        { id: "m4", title: "SOP kasir" },
        { id: "m5", title: "Stok" },
        { id: "m6", title: "Jadwal" },
        { id: "m7", title: "Training" },
      ],
    },
    {
      id: "w3",
      name: "Tumbuh",
      timeframe: "Bulan 3",
      description: "",
      milestones: [
        { id: "m8", title: "Iklan" },
        { id: "m9", title: "Loyalitas" },
        { id: "m10", title: "Kemitraan" },
        { id: "m11", title: "Cabang" },
      ],
    },
  ],
}

function rowCount(): number {
  let n = 0
  for (const d of ydocs.values()) n += d.getArray("database").length
  return n
}

function importReq(body: unknown) {
  return new NextRequest("http://localhost/api/workspace/roadmap-import", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...svc },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  queryMock.mockReset()
  ydocs.clear()
  fakeDocs = []
  queryMock.mockImplementation((sql: string, params?: unknown[]) => {
    const p = (params ?? []) as unknown[]
    // Wave lookup
    if (sql.includes("FROM dashboard.workspace_docs") && sql.includes("props->>'roadmap_id'")) {
      return Promise.resolve({
        rows: fakeDocs
          .filter((d) => d.props.roadmap_id === p[0])
          .map((d) => ({ id: d.id, title: d.title, props: d.props, updated_at: new Date(d.updated_at) })),
      })
    }
    // Project workspace / props reads
    if (sql.includes("SELECT workspace_id FROM dashboard.workspace_docs")) {
      const hit = fakeDocs.find((d) => d.id === p[0])
      return Promise.resolve({ rows: hit ? [{ workspace_id: "default" }] : [] })
    }
    if (sql.includes("SELECT props FROM dashboard.workspace_docs")) {
      const id = String(p[0]).replace(/^workspace:/, "")
      const hit = fakeDocs.find((d) => d.id === id)
      return Promise.resolve({ rows: hit ? [{ props: hit.props }] : [] })
    }
    // Doc creation (bare + workspace: rows)
    if (sql.includes("INSERT INTO dashboard.workspace_docs")) {
      const id = String(p[0])
      if (!id.startsWith("workspace:") && !fakeDocs.some((d) => d.id === id)) {
        fakeDocs.push({
          id,
          title: String(p[3]),
          props: JSON.parse(String(p[4])) as Record<string, unknown>,
          updated_at: new Date().toISOString(),
        })
      }
      return Promise.resolve({ rows: [], rowCount: 1 })
    }
    // Props lineage merge (both rows)
    if (sql.includes("SET props = COALESCE")) {
      const bare = String(p[1])
      const patch = JSON.parse(String(p[2])) as Record<string, unknown>
      const hit = fakeDocs.find((d) => d.id === bare)
      if (hit) hit.props = { ...hit.props, ...patch }
      return Promise.resolve({ rows: [], rowCount: 1 })
    }
    // Activity history for conflicts
    if (sql.includes("FROM dashboard.workspace_activity")) {
      return Promise.resolve({ rows: [{ summary: "user edited rows" }] })
    }
    return Promise.resolve({ rows: [], rowCount: 0 })
  })
})

describe("POST /api/workspace/roadmap-import", () => {
  it("imports 3 waves / 11 rows + threads + boardUrl", async () => {
    const res = await POST(importReq({ roadmap: ROADMAP }))
    expect(res.status).toBe(201)
    const j = await res.json()
    expect(j.docs.filter((d: { status: string }) => d.status === "created")).toHaveLength(3)
    expect(j.rowsAdded).toBe(11)
    expect(j.conflicts).toEqual([])
    expect(j.boardUrl).toBe(`/workspace/${j.projectId}?view=board`)
    expect(rowCount()).toBe(11)
    // Tiap wave doc lahir dengan thread-nya.
    const threads = queryMock.mock.calls.filter((c) =>
      String(c[0]).includes("INSERT INTO dashboard.workspace_threads"),
    )
    expect(threads).toHaveLength(3)
  })

  it("second import adds nothing (idempotent)", async () => {
    const first = await POST(importReq({ roadmap: ROADMAP }))
    const projectId = (await first.json()).projectId as string
    // Simulasi server: updated_at ikut when rows ditulis → samakan lastImportAt.
    for (const d of fakeDocs) {
      const ri = (d.props.roadmap_import ?? {}) as Record<string, unknown>
      d.updated_at = String(ri.at ?? d.updated_at)
    }
    const res = await POST(importReq({ roadmap: ROADMAP, projectId }))
    expect(res.status).toBe(201)
    const j = await res.json()
    expect(j.rowsAdded).toBe(0)
    expect(rowCount()).toBe(11)
    expect(j.docs.every((d: { status: string }) => d.status === "noop")).toBe(true)
  })

  it("user-edited wave doc → conflict with currentContent + history", async () => {
    const first = await POST(importReq({ roadmap: ROADMAP }))
    const projectId = (await first.json()).projectId as string
    // User menambah row manual setelah import, lalu import ulang dengan milestone baru.
    const wave = fakeDocs.find((d) => d.props.wave_id === "w1")!
    const ydoc = ydocs.get(wave.id)!
    ydoc.transact(() => {
      const m = new Y.Map<unknown>()
      m.set("title", "Catatan user")
      m.set("description", "manual")
      ydoc.getArray<Y.Map<unknown>>("database").push([m])
    })
    wave.updated_at = new Date(Date.now() + 60_000).toISOString() // lebih baru dari import
    const changed = {
      ...ROADMAP,
      phases: ROADMAP.phases.map((p) =>
        p.id === "w1" ? { ...p, milestones: [...p.milestones, { id: "m12", title: "Baru" }] } : p,
      ),
    }
    const res = await POST(importReq({ roadmap: changed, projectId }))
    expect(res.status).toBe(201)
    const j = await res.json()
    expect(j.conflicts).toHaveLength(1)
    expect(j.conflicts[0].currentContent).toContain("Catatan user")
    expect(j.conflicts[0].history).toContain("user edited rows")
    // Tidak ada tulis ke doc yang conflict.
    expect(rowCount()).toBe(12) // 11 + 1 manual, tanpa "Baru"
  })

  it("401s without credentials", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/workspace/roadmap-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roadmap: ROADMAP }),
      }),
    )
    expect(res.status).toBe(401)
  })
})
