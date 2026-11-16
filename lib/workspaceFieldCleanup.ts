import * as Y from "yjs"
import { query } from "@/lib/db"
import type { WorkspaceCredential } from "@/lib/workspaceAuth"
import { loadDbDoc, saveDbDoc } from "@/lib/workspaceDb"
import { dropCellKeys } from "@/lib/workspaceDbModel"

/**
 * Drop the values of deleted custom fields from every row of the room's
 * database doc (Yjs `cells`), then save so collab + the "My tasks" index
 * (`field_people`, keyed by field name) follow. Returns how many rows changed.
 */
export async function purgeFieldCells(
  docId: string,
  fieldIds: readonly string[],
  cred: WorkspaceCredential,
  allowPg: boolean,
): Promise<number> {
  if (fieldIds.length === 0) return 0
  const ids = new Set(fieldIds)
  const doc = await loadDbDoc(docId, cred, "user", allowPg)
  let changed = 0
  doc.transact(() => {
    for (const m of doc.getArray<Y.Map<unknown>>("database").toArray()) {
      const next = dropCellKeys(m.get("cells"), ids)
      if (next) {
        m.set("cells", next)
        changed++
      }
    }
  }, "user")
  if (changed > 0) await saveDbDoc(docId, doc, cred, "user")
  return changed
}

/** The stored props of a room doc (either id form), or {} when missing. */
export async function readRoomProps(docId: string): Promise<Record<string, unknown>> {
  const r = await query(`SELECT props FROM dashboard.workspace_docs WHERE id = $1 OR id = $2 LIMIT 1`, [`workspace:${docId}`, docId])
  return (r.rows[0]?.props as Record<string, unknown> | undefined) ?? {}
}
