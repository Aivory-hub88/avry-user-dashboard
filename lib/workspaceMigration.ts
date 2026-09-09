import { createEmptyDoc } from "@blocksuite/presets"
import { DocCollection, type Doc } from "@blocksuite/store"
// Register affine block flavour types (type-level only use here).
import "@blocksuite/blocks/schemas"

// Single Yjs instance discipline: everything below uses the Yjs copy owned by
// BlockSuite so constructor checks never break across bundled copies.
const Y = DocCollection.Y

export type LegacyFlatBlock = {
  id: string
  type: string
  text: string
  checked?: boolean
}

export type LegacyDbRow = {
  id: string
  title: string
  status: string
  priority: string
  assignee: string
  due: string
}

export type LegacyDocSnapshot = {
  blocks: LegacyFlatBlock[]
  rows: LegacyDbRow[]
}

/**
 * Detect the legacy prototype shape by CONTENT, not by constructor: top-level
 * `blocks` holding flat `{id,type,text}` maps. BlockSuite stores `blocks` as a
 * Y.Map of yBlocks (`{id,flavour,…}`), so a flat map with string `type`/`text`
 * keys and no `flavour` key is unambiguously legacy.
 *
 * NOTE: `doc.share.get("blocks")` must NOT be used for this — after state
 * arrives via `applyUpdate`, `share.get` can return an unbound AbstractType
 * instead of the real Y.Array. Probing through getArray/getMap is reliable.
 */
type FlatMap = { get: (key: string) => unknown }

/** Validated accessor for a flat legacy Y.Map (keeps the `this` binding). */
function asFlatMap(item: unknown): FlatMap | null {
  if (!item || typeof (item as { get?: unknown }).get !== "function") return null
  try {
    const m = item as FlatMap
    // NOTE: call as a method — detaching `get` loses its `this` binding.
    return typeof m.get("type") === "string" && m.get("flavour") === undefined ? m : null
  } catch {
    return null
  }
}

/** Read legacy flat blocks + database rows out of raw server bytes. */
export function extractLegacyDoc(update: Uint8Array | Buffer): LegacyDocSnapshot | null {
  const doc = new Y.Doc()
  try {
    Y.applyUpdate(doc, update instanceof Uint8Array ? update : new Uint8Array(update))
  } catch {
    return null
  }
  let items: unknown[]
  try {
    items = doc.getArray<unknown>("blocks").toArray()
  } catch {
    return null
  }
  const flat: FlatMap[] = []
  for (const item of items) {
    const m = asFlatMap(item)
    if (m) flat.push(m)
  }
  if (flat.length === 0) {
    // No flat blocks. A BlockSuite-native doc carries its tree in the Y.Map
    // side — never migrate that (re-migration would duplicate content).
    // A truly empty doc migrates to an empty tree via the normal init path,
    // so only the flat legacy shape returns a snapshot here.
    doc.destroy()
    return null
  }
  const blocks: LegacyFlatBlock[] = []
  let auto = 0
  for (const m of flat) {
    // Guarded by asFlatMap above; re-read defensively.
    const rawType = m.get("type")
    const rawText = m.get("text")
    const rawChecked = m.get("checked")
    const rawId = m.get("id")
    blocks.push({
      id: typeof rawId === "string" && rawId ? rawId : `legacy-${auto++}`,
      type: typeof rawType === "string" && rawType ? rawType : "p",
      text: typeof rawText === "string" ? rawText : "",
      checked: rawChecked === true ? true : undefined,
    })
  }
  const rows: LegacyDbRow[] = []
  try {
    const dbArray = doc.getArray("database")
    for (const item of dbArray.toArray()) {
      const m = item as unknown as { get?: (key: string) => unknown } | null
      if (!m || typeof m.get !== "function") continue
      const str = (key: string, fallback: string) => {
        const v = m.get!(key)
        return typeof v === "string" ? v : fallback
      }
      rows.push({
        id: str("id", `row-${rows.length}`),
        title: str("title", ""),
        status: str("status", "Todo"),
        priority: str("priority", "Med"),
        assignee: str("assignee", ""),
        due: str("due", ""),
      })
    }
  } catch {
    // Database array unreadable — migrate blocks anyway, data view stays empty.
  }
  doc.destroy()
  return { blocks, rows }
}

function insertLegacyBlock(doc: Doc, parentId: string | null, block: LegacyFlatBlock): void {
  // Mapping mirrors BlockSuite's own slash-menu conversion table
  // (affine:paragraph text/h1-h6/quote, affine:list bulleted/numbered/todo,
  // affine:code, affine:divider) — the same menu AFFiNE shows.
  const text = new doc.Text(block.text ?? "")
  switch (block.type) {
    case "h1":
    case "h2":
    case "h3":
    case "quote":
      doc.addBlock("affine:paragraph", { type: block.type, text }, parentId)
      break
    case "todo":
      doc.addBlock("affine:list", { type: "todo", text, checked: block.checked === true }, parentId)
      break
    case "bullet":
      doc.addBlock("affine:list", { type: "bulleted", text }, parentId)
      break
    case "numbered":
      doc.addBlock("affine:list", { type: "numbered", text }, parentId)
      break
    case "code":
      doc.addBlock("affine:code", { text }, parentId)
      break
    case "divider":
      doc.addBlock("affine:divider", {}, parentId)
      break
    case "database":
      // Table data travels via the `database` array below; the Data tab owns
      // it, so the page keeps no marker block.
      break
    default:
      doc.addBlock("affine:paragraph", { type: "text", text }, parentId)
      break
  }
}

/**
 * Build a fresh BlockSuite doc (page → surface → note → paragraph/heading/
 * list/…) from legacy flat blocks, carrying the database rows along in the
 * same `database` Y.Array shape the Data tab already reads. One-way: after
 * this state is persisted, the legacy prototype shape for this doc is gone
 * (its content lives on as real blocks).
 */
export function buildMigratedDoc(snapshot: LegacyDocSnapshot): Doc {
  const { doc, init } = createEmptyDoc()
  doc.load()
  init()
  const note = doc.getBlocksByFlavour("affine:note")[0]
  const parentId = note ? note.id : null
  for (const block of snapshot.blocks) {
    insertLegacyBlock(doc, parentId, block)
  }
  if (snapshot.rows.length > 0) {
    const dbArray = doc.spaceDoc.getArray("database")
    doc.spaceDoc.transact(() => {
      for (const row of snapshot.rows) {
        const m = new Y.Map<unknown>()
        m.set("id", row.id)
        m.set("title", row.title)
        m.set("status", row.status)
        m.set("priority", row.priority)
        m.set("assignee", row.assignee)
        m.set("due", row.due)
        dbArray.push([m as never])
      }
    })
  }
  return doc
}

/** Encode a migrated doc to storable bytes. */
export function encodeMigratedDoc(doc: Doc): Uint8Array {
  return DocCollection.Y.encodeStateAsUpdate(doc.spaceDoc)
}
