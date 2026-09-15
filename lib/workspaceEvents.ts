import { createHash } from "node:crypto"
import { query, withTransaction } from "@/lib/db"

/**
 * Buzz-style append-only event log for the workspace surface.
 *
 * Every human/agent action is one row: a namespaced `kind` (today: the same
 * action strings used by `recordWorkspaceActivity`, e.g. `page.created`,
 * `approval.requested`) plus a JSONB `payload`. Adding a feature means
 * emitting a new kind — existing readers filter by kind and ignore the rest,
 * so writers never break readers.
 *
 * Each row also carries a SHA-256 hash chained to the previous row within
 * the same workspace_id (Buzz's per-community audit chain). Writes take a
 * Postgres advisory lock keyed on workspace_id so concurrent writers can't
 * race on "read latest hash, then insert" and fork the chain.
 *
 * Writes are fire-and-forget (mirroring workspaceActivity): a logging failure
 * must never fail the user-facing request.
 */

export type WorkspaceEvent = {
  id: number
  kind: string
  workspace_id: string
  doc_id: string
  actor_type: "user" | "agent" | "system"
  actor_id: string | null
  actor_name: string | null
  payload: Record<string, unknown>
  prev_hash: string | null
  hash: string
  created_at: string
}

function chainHash(prevHash: string | null, row: {
  id: number
  kind: string
  doc_id: string
  actor_type: string
  actor_id: string | null
  created_at: string
  payload: string
}): string {
  return createHash("sha256")
    .update(
      `${prevHash ?? ""}|${row.id}|${row.kind}|${row.doc_id}|${row.actor_type}|` +
        `${row.actor_id ?? ""}|${row.created_at}|${row.payload}`,
    )
    .digest("hex")
}

export async function recordWorkspaceEvent(input: {
  kind: string
  workspaceId?: string
  docId: string
  actorType: "user" | "agent" | "system"
  actorId?: string | null
  actorName?: string | null
  payload?: Record<string, unknown>
}): Promise<void> {
  const workspaceId = (input.workspaceId ?? "default").slice(0, 64)
  const kind = input.kind.slice(0, 120)
  const docId = input.docId.slice(0, 64)
  const payloadJson = JSON.stringify(input.payload ?? {})

  try {
    await withTransaction(async (tx) => {
      // Serializes concurrent writers for this workspace so the chain never forks.
      await tx("SELECT pg_advisory_xact_lock(hashtext($1))", [workspaceId])

      const prevRow = await tx(
        `SELECT hash FROM dashboard.workspace_events
         WHERE workspace_id = $1 ORDER BY id DESC LIMIT 1`,
        [workspaceId],
      )
      const prevHash: string | null = prevRow.rows[0]?.hash ?? null

      const inserted = await tx(
        `INSERT INTO dashboard.workspace_events
          (kind, workspace_id, doc_id, actor_type, actor_id, actor_name, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
         RETURNING id, created_at::text AS created_at, payload::text AS payload`,
        [kind, workspaceId, docId, input.actorType, input.actorId ?? null, input.actorName ?? null, payloadJson],
      )
      // created_at and payload are both cast ::text in SQL and read back
      // post-insert (not built from the pre-insert JS values) so the string
      // hashed here matches exactly what a later read of the row — or the
      // backfill migration, which used the same ::text casts — would see.
      // Postgres's timestamptz/jsonb text output doesn't round-trip through
      // JS's toISOString()/JSON.stringify() byte-for-byte, which would
      // otherwise make the chain look tampered without any tampering.
      const { id, created_at, payload: payloadText } = inserted.rows[0] as {
        id: number
        created_at: string
        payload: string
      }

      const hash = chainHash(prevHash, {
        id,
        kind,
        doc_id: docId,
        actor_type: input.actorType,
        actor_id: input.actorId ?? null,
        created_at,
        payload: payloadText,
      })

      await tx(`UPDATE dashboard.workspace_events SET prev_hash = $1, hash = $2 WHERE id = $3`, [
        prevHash,
        hash,
        id,
      ])
    })
  } catch (error) {
    console.error("[workspace events]", error)
  }
}

/**
 * Recompute the chain for a workspace and compare against stored hashes.
 * Returns the id of the first row where the chain breaks (tampering, a
 * dropped row, or out-of-band edit), or null if the whole chain is intact.
 */
export async function verifyWorkspaceEventChain(workspaceId: string): Promise<{ intact: boolean; brokenAtId: number | null }> {
  const r = await query(
    `SELECT id, kind, doc_id, actor_type, actor_id, created_at::text AS created_at, payload::text AS payload, prev_hash, hash
     FROM dashboard.workspace_events WHERE workspace_id = $1 ORDER BY id ASC`,
    [workspaceId],
  )
  let prevHash: string | null = null
  for (const row of r.rows as (Omit<WorkspaceEvent, "payload"> & { payload: string })[]) {
    const expected = chainHash(prevHash, {
      id: row.id,
      kind: row.kind,
      doc_id: row.doc_id,
      actor_type: row.actor_type,
      actor_id: row.actor_id,
      created_at: row.created_at,
      payload: row.payload,
    })
    if (expected !== row.hash || (row.prev_hash ?? null) !== prevHash) {
      return { intact: false, brokenAtId: row.id }
    }
    prevHash = row.hash
  }
  return { intact: true, brokenAtId: null }
}

/** Read the latest events for a doc, optionally filtered by kind. */
export async function queryWorkspaceEvents(
  docId: string,
  opts: { kinds?: string[]; limit?: number } = {},
): Promise<WorkspaceEvent[]> {
  const n = Math.min(Math.max(opts.limit ?? 50, 1), 200)
  try {
    const r =
      opts.kinds && opts.kinds.length > 0
        ? await query(
            `SELECT id, kind, workspace_id, doc_id, actor_type, actor_id, actor_name, payload, created_at
             FROM dashboard.workspace_events
             WHERE doc_id = $1 AND kind = ANY($2)
             ORDER BY id DESC LIMIT $3`,
            [docId, opts.kinds, n],
          )
        : await query(
            `SELECT id, kind, workspace_id, doc_id, actor_type, actor_id, actor_name, payload, created_at
             FROM dashboard.workspace_events
             WHERE doc_id = $1
             ORDER BY id DESC LIMIT $2`,
            [docId, n],
          )
    return r.rows as WorkspaceEvent[]
  } catch (error) {
    console.error("[workspace events read]", error)
    return []
  }
}
