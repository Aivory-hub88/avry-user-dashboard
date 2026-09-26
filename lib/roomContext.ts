/**
 * What an agent knows about the room it's working in — SERVER-ONLY (ADR-019 P3).
 *
 * ingestRoomFiles: text out of the room's ready files → chunks in
 *   dashboard.workspace_chunks (doc_id = room, row_id = "file:<id>:<n>"),
 *   file → ingested (or failed). Best effort, bounded per call; embeddings
 *   are added only when a key is configured (prod has none today).
 * loadRoomContext: the brief, the task board, the file list and the chunks
 *   most relevant to this turn's instruction.
 */
import * as Y from "yjs"
import { query } from "@/lib/db"
import { embed, embeddingsConfigured } from "@/lib/embeddings"
import { getObjectBytes } from "@/lib/r2"
import { extractText } from "@/lib/roomFileText"
import { chunkText, rankChunks } from "@/lib/roomChunks"
import { MAX_FILE_BYTES } from "@/lib/workspaceFiles"
import { canonicalRoomId, legacyDocId, mergeYjsUpdates } from "@/lib/workspaceDoc"
import { rowsFromDbDoc } from "@/lib/workspaceDb"

const INGEST_FILES_PER_CALL = 3
const MAX_EMBEDDED_CHUNKS = 60
const EXCERPTS = 5
const MAX_TASK_ROWS = 30

export interface RoomContext {
  brief: string
  tasks: string
  notes: string
  files: string
  excerpts: { file: string; text: string }[]
}

/** Chunk and store up to a few not-yet-ingested files of a room. Never throws. */
export async function ingestRoomFiles(roomId: string): Promise<number> {
  let done = 0
  try {
    const r = await query(
      `SELECT id, workspace_id, key, name, mime FROM dashboard.workspace_files
       WHERE room_id = $1 AND status = 'ready' AND deleted_at IS NULL
       ORDER BY created_at ASC LIMIT ${INGEST_FILES_PER_CALL}`,
      [roomId],
    )
    for (const f of r.rows as { id: string; workspace_id: string; key: string; name: string; mime: string }[]) {
      // Claim it so a parallel turn doesn't process the same file.
      const claim = await query(
        `UPDATE dashboard.workspace_files SET status = 'ingested', updated_at = now() WHERE id = $1 AND status = 'ready' RETURNING id`,
        [f.id],
      )
      if ((claim.rowCount ?? 0) === 0) continue
      try {
        const bytes = await getObjectBytes(f.key, MAX_FILE_BYTES)
        const text = bytes ? await extractText(bytes, f.mime) : ""
        const chunks = chunkText(text)
        await query(`DELETE FROM dashboard.workspace_chunks WHERE doc_id = $1 AND row_id LIKE $2`, [roomId, `file:${f.id}:%`])
        const useVectors = embeddingsConfigured()
        for (const [i, c] of chunks.entries()) {
          const vec = useVectors && i < MAX_EMBEDDED_CHUNKS ? await embed(c) : null
          await query(
            `INSERT INTO dashboard.workspace_chunks (workspace_id, doc_id, row_id, text, embedding, updated_at)
             VALUES ($1, $2, $3, $4, $5::vector, now())
             ON CONFLICT (doc_id, row_id) DO UPDATE SET text = EXCLUDED.text, embedding = EXCLUDED.embedding, updated_at = now()`,
            [f.workspace_id, roomId, `file:${f.id}:${i}`, c, vec ? `[${vec.join(",")}]` : null],
          )
        }
        done++
      } catch (e) {
        console.error("[room ingest]", f.id, e)
        await query(`UPDATE dashboard.workspace_files SET status = 'failed', updated_at = now() WHERE id = $1`, [f.id]).catch(() => {})
      }
    }
  } catch (e) {
    console.error("[room ingest]", roomId, e)
  }
  return done
}

/** Whether a file produced any indexed text (images and empty files don't). */
export async function fileHasText(roomId: string, fileId: string): Promise<boolean> {
  const r = await query(`SELECT 1 FROM dashboard.workspace_chunks WHERE doc_id = $1 AND row_id LIKE $2 LIMIT 1`, [roomId, `file:${fileId}:%`])
  return (r.rowCount ?? r.rows.length) > 0
}

/** Remove a file's chunks (soft-deleted files stop informing agents). */
export async function dropFileChunks(roomId: string, fileId: string): Promise<void> {
  await query(`DELETE FROM dashboard.workspace_chunks WHERE doc_id = $1 AND row_id LIKE $2`, [roomId, `file:${fileId}:%`]).catch(() => {})
}

function briefText(props: Record<string, unknown>, title: string): string {
  const b = (props.brief && typeof props.brief === "object" ? props.brief : {}) as Record<string, unknown>
  const lines = [`Project: ${title}`]
  if (typeof b.goal === "string" && b.goal.trim()) lines.push(`Goal: ${b.goal.trim()}`)
  if (typeof b.deadline === "string" && b.deadline) lines.push(`Deadline: ${b.deadline}`)
  if (typeof b.priority === "string" && b.priority) lines.push(`Priority: ${b.priority}`)
  for (const f of Array.isArray(b.fields) ? (b.fields as { label?: unknown; value?: unknown }[]) : []) {
    if (typeof f.label === "string" && typeof f.value === "string" && f.label) lines.push(`${f.label}: ${f.value}`)
  }
  return lines.join("\n")
}

/** Task board rows straight from the stored Y.Doc (no collab round trip). */
async function taskText(roomId: string, props: Record<string, unknown>): Promise<string> {
  const r = await query(`SELECT id, yjs_update FROM dashboard.workspace_docs WHERE id = $1 OR id = $2`, [canonicalRoomId(roomId), legacyDocId(roomId)])
  const byId = new Map<string, Buffer>(r.rows.map((row) => [row.id as string, row.yjs_update as Buffer]))
  const merged = mergeYjsUpdates([byId.get(canonicalRoomId(roomId)) ?? null, byId.get(legacyDocId(roomId)) ?? null])
  if (!merged) return ""
  const doc = new Y.Doc()
  Y.applyUpdate(doc, new Uint8Array(merged))
  const rows = rowsFromDbDoc(doc)
  if (rows.length === 0) return ""
  const fields = (Array.isArray(props.dbFields) ? props.dbFields : []) as { id?: string; name?: string }[]
  const lines = rows.slice(0, MAX_TASK_ROWS).map((row) => {
    const extra = fields
      .map((f) => (f.id && f.name && row.cells[f.id] !== undefined && row.cells[f.id] !== "" ? `${f.name}: ${String(row.cells[f.id])}` : ""))
      .filter(Boolean)
    const bits = [row.status, row.priority !== "Med" ? `${row.priority} priority` : "", row.assignee ? `assigned to ${row.assignee}` : "", row.due ? `due ${row.due}` : "", ...extra].filter(Boolean)
    return `- ${row.title}${bits.length ? ` (${bits.join(", ")})` : ""}`
  })
  if (rows.length > MAX_TASK_ROWS) lines.push(`- …and ${rows.length - MAX_TASK_ROWS} more`)
  return lines.join("\n")
}

const MAX_NOTES = 10
const MAX_NOTE_CHARS = 400

/** "2026-10-02" (or a pg DATE) → "2 Oct 2026". */
function noteDay(v: unknown): string {
  const d = v instanceof Date ? v : typeof v === "string" ? new Date(`${v.slice(0, 10)}T00:00:00`) : null
  return d && Number.isFinite(d.getTime()) ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : ""
}

/**
 * The room's newest notes as "## title" + a clipped body. Notes meant for
 * the agent running this turn come first; dated or addressed notes say so
 * in the heading ("for you", "for Rina", "2 Oct 2026").
 */
async function notesText(roomId: string, agentType?: string): Promise<string> {
  const r = await query(
    `SELECT title, body, on_date, for_kind, for_id, for_name FROM dashboard.room_notes
     WHERE room_id = $1 AND deleted_at IS NULL
     ORDER BY (for_kind = 'agent' AND for_id = $2) IS TRUE DESC, updated_at DESC LIMIT ${MAX_NOTES}`,
    [roomId, agentType ?? ""],
  )
  return (r.rows as { title: string; body: string; on_date?: unknown; for_kind?: string | null; for_id?: string | null; for_name?: string | null }[])
    .map((n) => {
      const body = n.body.replace(/\s+/g, " ").trim()
      const forYou = n.for_kind === "agent" && agentType && n.for_id === agentType
      const tags = [
        forYou ? "for you" : n.for_kind && n.for_name ? `for ${n.for_name}` : "",
        n.on_date ? noteDay(n.on_date) : "",
      ].filter(Boolean)
      const heading = `${n.title.trim() || "Untitled note"}${tags.length ? ` (${tags.join(", ")})` : ""}`
      return `## ${heading}\n${body.length > MAX_NOTE_CHARS ? `${body.slice(0, MAX_NOTE_CHARS)}…` : body}`
    })
    .join("\n\n")
}

/** Everything a turn should know about its room. Parts that fail load as empty. */
export async function loadRoomContext(roomId: string, instruction: string, agentType?: string): Promise<RoomContext | null> {
  try {
    const d = await query(`SELECT id, title, props FROM dashboard.workspace_docs WHERE id = $1 OR id = $2`, [`workspace:${roomId}`, roomId])
    const rows = d.rows as { id: string; title: string | null; props: Record<string, unknown> | null }[]
    const row = rows.find((x) => x.id === `workspace:${roomId}`) ?? rows[0]
    if (!row) return null
    const props = row.props ?? {}
    const title = row.title ?? "Untitled"

    const [tasks, notes, fileRows, chunkRows] = await Promise.all([
      taskText(roomId, props).catch(() => ""),
      notesText(roomId, agentType).catch(() => ""),
      query(
        `SELECT id, name, status FROM dashboard.workspace_files WHERE room_id = $1 AND deleted_at IS NULL AND status IN ('ready', 'ingested') ORDER BY created_at ASC LIMIT 50`,
        [roomId],
      ).then((x) => x.rows as { id: string; name: string; status: string }[]),
      query(
        `SELECT row_id, text FROM dashboard.workspace_chunks WHERE doc_id = $1 AND row_id LIKE 'file:%' LIMIT 600`,
        [roomId],
      ).then((x) => x.rows as { row_id: string; text: string }[]),
    ])

    const nameOf = new Map(fileRows.map((f) => [f.id, f.name]))
    const items = chunkRows
      .map((c) => ({ text: c.text, file: nameOf.get(c.row_id.split(":")[1]) ?? "" }))
      .filter((c) => c.file)
    let excerpts = rankChunks(instruction, items, EXCERPTS).map((r) => ({ file: r.item.file, text: r.item.text }))
    // Nothing matched the wording: give the opening of each file so the agent still knows what's in them.
    if (excerpts.length === 0) {
      const firsts = chunkRows.filter((c) => c.row_id.endsWith(":0"))
      excerpts = firsts
        .map((c) => ({ file: nameOf.get(c.row_id.split(":")[1]) ?? "", text: c.text }))
        .filter((c) => c.file)
        .slice(0, 3)
    }

    return {
      brief: briefText(props, title),
      tasks,
      notes,
      files: fileRows.map((f) => `- ${f.name}`).join("\n"),
      excerpts,
    }
  } catch (e) {
    console.error("[room context]", roomId, e)
    return null
  }
}
