import * as Y from "yjs"

/**
 * Canonical room key shared with aivory-collab.
 *
 * Collab normalizes every HTTP doc id to `workspace:{id}` and keys its rooms
 * (and OctoBase pg rows) by that full id, merging the legacy bare-id row on
 * first access. The dashboard pg fallback must read the same way, otherwise a
 * collab outage serves a stale bare-id snapshot while the canonical room row
 * holds the merged state.
 */
export function canonicalRoomId(id: string): string {
  return id.startsWith("workspace:") ? id : `workspace:${id}`
}

/** Legacy bare doc id (dashboard snapshot rows written before canonicalization). */
export function legacyDocId(id: string): string {
  return id.startsWith("workspace:") ? id.slice("workspace:".length) : id
}

/**
 * Yjs-merge several full-state updates into one. Union-only: blocks/rows that
 * exist in any input survive, which is exactly the crash-safe behavior we want
 * for fallback reads (never synthesize deletions across divergent snapshots).
 * Returns null when every input is empty/invalid so callers keep 404 semantics.
 */
export function mergeYjsUpdates(parts: Array<Uint8Array | Buffer | null | undefined>): Buffer | null {
  const doc = new Y.Doc()
  let applied = false
  for (const part of parts) {
    if (!part || part.length === 0) continue
    try {
      Y.applyUpdate(doc, part instanceof Uint8Array ? part : new Uint8Array(part))
      applied = true
    } catch {
      // Ignore corrupt snapshots — a bad row must not break the merged read.
    }
  }
  if (!applied) return null
  return Buffer.from(Y.encodeStateAsUpdate(doc))
}
