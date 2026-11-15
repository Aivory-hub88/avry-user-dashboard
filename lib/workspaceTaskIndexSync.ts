import * as Y from "yjs"
import { query } from "@/lib/db"
import { canonicalRoomId, legacyDocId, mergeYjsUpdates } from "@/lib/workspaceDoc"
import { rowsFromDbDoc } from "@/lib/workspaceDb"
import { bareDocId, syncTaskIndex } from "@/lib/workspaceTaskIndex"

/**
 * Index sync for writes that only touch the stored Yjs blob (the UI's
 * debounced `/doc` PUT, every ~2s while someone edits): read the merged
 * canonical + legacy rows from pg and re-sync that doc's tasks. Coalesced
 * per doc so a burst of PUTs costs one decode a few seconds later.
 */

const DEBOUNCE_MS = 3000
const pending = new Map<string, ReturnType<typeof setTimeout>>()

export async function syncTaskIndexFromStore(id: string): Promise<number> {
  const r = await query("SELECT id, yjs_update, workspace_id FROM dashboard.workspace_docs WHERE id = $1 OR id = $2", [
    canonicalRoomId(id),
    legacyDocId(id),
  ])
  if (r.rows.length === 0) return 0
  const byId = new Map<string, Buffer>(r.rows.map((row) => [row.id as string, row.yjs_update as Buffer]))
  const merged = mergeYjsUpdates([byId.get(canonicalRoomId(id)) ?? null, byId.get(legacyDocId(id)) ?? null])
  const doc = new Y.Doc()
  try {
    if (merged && merged.byteLength > 0) Y.applyUpdate(doc, new Uint8Array(merged))
    const rows = rowsFromDbDoc(doc)
    await syncTaskIndex(id, rows, (r.rows[0]?.workspace_id as string | undefined) ?? undefined)
    return rows.length
  } finally {
    doc.destroy()
  }
}

/** Schedule a store-based sync for `id` (debounced per bare doc id). */
export function scheduleTaskIndexSync(id: string): void {
  const key = bareDocId(id)
  if (!key) return
  const prev = pending.get(key)
  if (prev) clearTimeout(prev)
  pending.set(
    key,
    setTimeout(() => {
      pending.delete(key)
      void syncTaskIndexFromStore(key).catch((e) => console.error("[workspace task index sync]", e))
    }, DEBOUNCE_MS),
  )
}
