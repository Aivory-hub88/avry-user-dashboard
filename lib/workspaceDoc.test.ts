import { describe, expect, it } from "vitest"
import * as Y from "yjs"
import { canonicalRoomId, legacyDocId, mergeYjsUpdates } from "./workspaceDoc"

function stateWithBlocks(blocks: Array<{ id: string; type: string; text: string }>): Buffer {
  const doc = new Y.Doc()
  const arr = doc.getArray<Y.Map<unknown>>("blocks")
  doc.transact(() => {
    for (const b of blocks) {
      const m = new Y.Map<unknown>()
      m.set("id", b.id)
      m.set("type", b.type)
      m.set("text", b.text)
      arr.push([m])
    }
  })
  return Buffer.from(Y.encodeStateAsUpdate(doc))
}

function blockTexts(update: Uint8Array): string[] {
  const doc = new Y.Doc()
  Y.applyUpdate(doc, update)
  return doc
    .getArray<Y.Map<unknown>>("blocks")
    .toArray()
    .map((m) => `${m.get("type")}:${m.get("text")}`)
}

describe("workspaceDoc room keys", () => {
  it("canonicalizes bare ids to the workspace: room collab uses", () => {
    expect(canonicalRoomId("demo")).toBe("workspace:demo")
    expect(canonicalRoomId("workspace:demo")).toBe("workspace:demo")
  })

  it("resolves the legacy bare id for old snapshot rows", () => {
    expect(legacyDocId("workspace:demo")).toBe("demo")
    expect(legacyDocId("demo")).toBe("demo")
  })
})

describe("mergeYjsUpdates", () => {
  it("unions blocks from divergent snapshots (split-brain rooms)", () => {
    // Both rooms share history (same h1 item), then diverge: bare room gains
    // an h2, canonical room gains a bullet — the real production case.
    const base = new Y.Doc()
    const baseArr = base.getArray<Y.Map<unknown>>("blocks")
    base.transact(() => {
      const m = new Y.Map<unknown>()
      m.set("id", "a")
      m.set("type", "h1")
      m.set("text", "Video meeting app")
      baseArr.push([m])
    })
    const baseUpdate = Y.encodeStateAsUpdate(base)

    const docA = new Y.Doc()
    Y.applyUpdate(docA, baseUpdate)
    const arrA = docA.getArray<Y.Map<unknown>>("blocks")
    docA.transact(() => {
      const m = new Y.Map<unknown>()
      m.set("id", "b")
      m.set("type", "h2")
      m.set("text", "")
      arrA.push([m])
    })

    const docB = new Y.Doc()
    Y.applyUpdate(docB, baseUpdate)
    const arrB = docB.getArray<Y.Map<unknown>>("blocks")
    docB.transact(() => {
      const m = new Y.Map<unknown>()
      m.set("id", "c")
      m.set("type", "bullet")
      m.set("text", "")
      arrB.push([m])
    })

    const merged = mergeYjsUpdates([
      Buffer.from(Y.encodeStateAsUpdate(docB)),
      Buffer.from(Y.encodeStateAsUpdate(docA)),
    ])
    expect(merged).not.toBeNull()
    // Union: nothing either side knew is lost, shared history stays single.
    expect(blockTexts(merged!).sort()).toEqual(["bullet:", "h1:Video meeting app", "h2:"].sort())
  })

  it("returns null when every snapshot is empty", () => {
    expect(mergeYjsUpdates([null, undefined, Buffer.alloc(0)])).toBeNull()
  })

  it("skips corrupt snapshots instead of throwing", () => {
    const good = stateWithBlocks([{ id: "a", type: "p", text: "hi" }])
    const merged = mergeYjsUpdates([Buffer.from([0, 1, 2, 3]), good])
    expect(merged).not.toBeNull()
    expect(blockTexts(merged!)).toEqual(["p:hi"])
  })
})
