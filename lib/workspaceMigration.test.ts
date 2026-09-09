import { describe, expect, it } from "vitest"
import * as Y from "yjs"
import {
  buildMigratedDoc,
  encodeMigratedDoc,
  extractLegacyDoc,
  type LegacyDocSnapshot,
} from "./workspaceMigration"
import { createEmptyDoc } from "@blocksuite/presets"
import { DocCollection } from "@blocksuite/store"

function legacyUpdate(
  blocks: Array<{ id: string; type: string; text: string; checked?: boolean }>,
  rows: Array<Record<string, string>> = [],
): Buffer {
  const doc = new Y.Doc()
  const arr = doc.getArray<Y.Map<unknown>>("blocks")
  doc.transact(() => {
    for (const b of blocks) {
      const m = new Y.Map<unknown>()
      m.set("id", b.id)
      m.set("type", b.type)
      m.set("text", b.text)
      if (b.checked !== undefined) m.set("checked", b.checked)
      arr.push([m])
    }
  })
  if (rows.length > 0) {
    const db = doc.getArray<Y.Map<unknown>>("database")
    doc.transact(() => {
      for (const r of rows) {
        const m = new Y.Map<unknown>()
        for (const [k, v] of Object.entries(r)) m.set(k, v)
        db.push([m])
      }
    })
  }
  return Buffer.from(Y.encodeStateAsUpdate(doc))
}

function flavours(doc: { getBlocksByFlavour: (f: string) => Array<{ model: { flavour: string } & Record<string, unknown> }> }) {
  return (["affine:paragraph", "affine:list", "affine:code", "affine:divider"] as const).flatMap((f) =>
    doc.getBlocksByFlavour(f).map((b) => {
      const model = b.model as { flavour: string; type?: string; text?: { toString: () => string }; checked?: boolean }
      return `${model.flavour}:${model.type ?? "-"}:${model.text?.toString() ?? ""}:${model.checked ?? ""}`
    }),
  )
}

describe("extractLegacyDoc", () => {
  it("reads flat blocks and database rows from legacy bytes", () => {
    const snap = extractLegacyDoc(
      legacyUpdate(
        [
          { id: "a", type: "h1", text: "Video meeting app" },
          { id: "b", type: "todo", text: "Ship it", checked: true },
        ],
        [{ id: "r1", title: "Acme", status: "Todo", priority: "High", assignee: "", due: "" }],
      ),
    )
    expect(snap).not.toBeNull()
    expect(snap!.blocks).toHaveLength(2)
    expect(snap!.blocks[0]).toMatchObject({ type: "h1", text: "Video meeting app" })
    expect(snap!.blocks[1]).toMatchObject({ type: "todo", checked: true })
    expect(snap!.rows).toHaveLength(1)
    expect(snap!.rows[0]).toMatchObject({ title: "Acme", status: "Todo" })
  })

  it("returns null for BlockSuite-native state (Y.Map blocks)", () => {
    const { doc, init } = createEmptyDoc()
    doc.load()
    init()
    const bytes = DocCollection.Y.encodeStateAsUpdate(doc.spaceDoc)
    doc.dispose()
    // Native tree carries no flat {type,text} maps, so it must never migrate
    // (re-migration would duplicate content on every load).
    expect(extractLegacyDoc(bytes)).toBeNull()
  })

  it("returns null for corrupt bytes", () => {
    expect(extractLegacyDoc(Buffer.from([0, 1, 2, 3]))).toBeNull()
  })
})

describe("buildMigratedDoc", () => {
  it("converts every legacy type to its AFFiNE block (slash-menu table)", () => {
    const snapshot: LegacyDocSnapshot = {
      blocks: [
        { id: "1", type: "h1", text: "Video meeting app" },
        { id: "2", type: "h2", text: "Section" },
        { id: "3", type: "p", text: "Hello" },
        { id: "4", type: "todo", text: "Ship it", checked: true },
        { id: "5", type: "bullet", text: "Item" },
        { id: "6", type: "numbered", text: "First" },
        { id: "7", type: "quote", text: "Wisdom" },
        { id: "8", type: "code", text: "const a = 1" },
        { id: "9", type: "divider", text: "" },
        { id: "10", type: "database", text: "" },
        { id: "11", type: "weird-future-type", text: "Safe" },
      ],
      rows: [{ id: "r1", title: "Acme", status: "Doing", priority: "High", assignee: "A", due: "2026-09-10" }],
    }
    const doc = buildMigratedDoc(snapshot)
    try {
      // Migrated state must never look legacy again (no re-migration).
      expect(extractLegacyDoc(encodeMigratedDoc(doc))).toBeNull()
      const got = flavours(doc as never).sort()
      expect(got).toContain("affine:paragraph:h1:Video meeting app:")
      expect(got).toContain("affine:paragraph:h2:Section:")
      expect(got).toContain("affine:paragraph:text:Hello:")
      expect(got).toContain("affine:list:todo:Ship it:true")
      expect(got).toContain("affine:list:bulleted:Item:false")
      expect(got).toContain("affine:list:numbered:First:false")
      expect(got).toContain("affine:paragraph:quote:Wisdom:")
      expect(got).toContain("affine:code:-:const a = 1:")
      expect(got).toContain("affine:divider:-::")
      // Unknown future types degrade to plain text, never throw.
      expect(got).toContain("affine:paragraph:text:Safe:")
      // Database block becomes no page marker; rows travel with the doc.
      const roundTrip = new DocCollection.Y.Doc()
      DocCollection.Y.applyUpdate(roundTrip, encodeMigratedDoc(doc))
      const rows = roundTrip.getArray("database").toArray() as Array<{ get: (k: string) => unknown }>
      expect(rows).toHaveLength(1)
      expect(rows[0].get("title")).toBe("Acme")
      expect(rows[0].get("status")).toBe("Doing")
    } finally {
      doc.dispose()
    }
  })

  it("migrates an empty legacy doc to a clean empty tree", () => {
    const doc = buildMigratedDoc({ blocks: [], rows: [] })
    try {
      expect(doc.root?.flavour).toBe("affine:page")
    } finally {
      doc.dispose()
    }
  })
})
