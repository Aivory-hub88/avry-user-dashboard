/**
 * POST /api/workspace/roadmap-import — roadmap → project (Phase 4, killer flow).
 *
 * Body: { roadmap: AiryRoadmap, projectId? }. Tiap phase → 1 member doc,
 * tiap milestone → 1 task row. Lineage di props + marker description.
 * Idempotent (match wave_id/marker) + conflict path (currentContent +
 * history, tidak pernah silent overwrite). Selesai → client push ?view=board.
 */
import * as Y from "yjs"
import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { getDocRole, canWrite } from "@/lib/workspaceAccess"
import { workspaceCredential, unauthorized, forbidden } from "@/lib/workspaceAuth"
import { authorizeDocFallback } from "@/lib/workspaceAuth"
import { recordWorkspaceActivity } from "@/lib/workspaceActivity"
import {
  loadDbDoc,
  saveDbDoc,
  dbRowToYMap,
  newDbRowId,
  type DbRow,
} from "@/lib/workspaceDb"
import {
  RoadmapImportSchema,
  planWave,
  waveThreadBody,
  type ExistingWave,
  type PlannedRow,
} from "@/lib/spaceRoadmap"
import { newId } from "@/lib/spaceWrite"

export const runtime = "nodejs"
export const maxDuration = 120

const MARKER_FIRST_LINE = /^<!-- roadmap:[^:\s]+:[^:\s]+ -->$/;

function markerOf(description: string): string | null {
  const first = description.split("\n")[0]?.trim() ?? ""
  return MARKER_FIRST_LINE.test(first) ? first : null
}

async function recentHistory(docId: string): Promise<string[]> {
  try {
    const r = await query(
      `SELECT summary FROM dashboard.workspace_activity
       WHERE doc_id = $1 ORDER BY created_at DESC LIMIT 10`,
      [docId],
    )
    return (r.rows as Record<string, unknown>[])
      .map((row) => String(row.summary ?? ""))
      .filter(Boolean)
  } catch {
    return []
  }
}

async function setPropsLineage(docId: string, patch: Record<string, unknown>) {
  await query(
    `UPDATE dashboard.workspace_docs
     SET props = COALESCE(props, '{}'::jsonb) || $3::jsonb, updated_at = now()
     WHERE id = $1 OR id = $2`,
    [`workspace:${docId}`, docId, JSON.stringify(patch)],
  )
}

async function createDoc(
  title: string,
  owner: string,
  workspaceId: string,
  props: Record<string, unknown>,
): Promise<string> {
  const id = newId()
  for (const docId of [id, `workspace:${id}`]) {
    await query(
      `INSERT INTO dashboard.workspace_docs (id, workspace_id, owner, title, props, yjs_update, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, ''::bytea, now())
       ON CONFLICT (id) DO NOTHING`,
      [docId, workspaceId, owner, title, JSON.stringify(props)],
    )
  }
  return id
}

async function createWaveThread(
  spaceId: string,
  threadId: string,
  body: string,
  createdBy: string,
  topicTitle: string,
) {
  await query(
    `INSERT INTO dashboard.workspace_threads (id, space_id, created_by)
     VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [threadId, spaceId, createdBy],
  )
  await query(
    `INSERT INTO dashboard.workspace_messages
       (id, space_id, thread_root, author_kind, author_id, author_name,
        body, mentions, member_ids, here, has_agent, doc_refs)
     VALUES ($1, $2, NULL, 'system', 'roadmap-import', 'Roadmap import',
             $3, '{}', '{}', false, false, '{}')
     ON CONFLICT DO NOTHING`,
    [threadId, spaceId, body],
  )
  await query(
    `INSERT INTO dashboard.workspace_topics (id, thread_root, title, archived, created_by)
     VALUES ($1, $2, $3, false, $4) ON CONFLICT DO NOTHING`,
    [newId(), threadId, topicTitle, createdBy],
  )
}

export async function POST(req: NextRequest) {
  const credential = workspaceCredential(req)
  if (!credential) return unauthorized()
  const owner = credential.kind === "service" ? "service" : credential.user.user_id
  const createdBy = credential.kind === "service" ? "system:service" : `user:${owner}`

  const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = RoadmapImportSchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: "invalid roadmap" }, { status: 400 })
  const { roadmap, projectId: givenProjectId } = parsed.data
  const now = new Date().toISOString()

  try {
    // 1. Project doc: pakai yang ada (wajib writable) atau buat baru.
    let projectId = givenProjectId ?? null
    let workspaceId = "default"
    if (projectId) {
      if (!canWrite(await getDocRole(credential, projectId)))
        return forbidden()
      const ws = await query(`SELECT workspace_id FROM dashboard.workspace_docs WHERE id = $1`, [projectId])
      workspaceId = String((ws.rows[0] as Record<string, unknown> | undefined)?.workspace_id ?? "default")
    } else {
      projectId = await createDoc(roadmap.title, owner, workspaceId, {
        isProject: true,
        projectDocs: [],
        roadmap_id: roadmap.id,
      })
    }

    // 2. Wave docs existing untuk roadmap ini.
    const found = await query(
      `SELECT id, title, props, updated_at FROM dashboard.workspace_docs
       WHERE (props->>'roadmap_id') = $1 AND id NOT LIKE 'workspace:%'
         AND id NOT LIKE 'db:%' AND deleted_at IS NULL`,
      [roadmap.id],
    )
    const byWave = new Map<string, { docId: string; title: string; props: Record<string, unknown>; updatedAt: string }>()
    for (const row of found.rows as Record<string, unknown>[]) {
      const props = (row.props ?? {}) as Record<string, unknown>
      const waveId = typeof props.wave_id === "string" ? props.wave_id : null
      if (!waveId || byWave.has(waveId)) continue
      const updated = row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at ?? now)
      byWave.set(waveId, {
        docId: String(row.id),
        title: String(row.title ?? ""),
        props,
        updatedAt: updated,
      })
    }

    const allowPg = credential.kind === "service" ? true : await authorizeDocFallback(credential, projectId)
    const docs: { waveId: string; docId: string; title: string; status: string }[] = []
    const conflicts: { waveId: string; docId: string; title: string; currentContent: string[]; history: string[] }[] = []
    let rowsAdded = 0
    let rowsUpdated = 0
    const memberDocs = new Set<string>()

    for (const phase of roadmap.phases) {
      const hit = byWave.get(phase.id) ?? null
      let existing: ExistingWave | null = null
      let ydoc: Y.Doc | null = null
      let allTitles: string[] = []
      if (hit) {
        memberDocs.add(hit.docId)
        try {
          const allow = credential.kind === "service" ? true : await authorizeDocFallback(credential, hit.docId)
          ydoc = await loadDbDoc(hit.docId, credential, "system", allow)
          const rows: ExistingWave["rows"] = []
          allTitles = []
          for (const m of ydoc.getArray<Y.Map<unknown>>("database").toArray()) {
            const title = typeof m.get("title") === "string" ? (m.get("title") as string) : ""
            if (title) allTitles.push(title)
            const desc = typeof m.get("description") === "string" ? (m.get("description") as string) : ""
            const marker = markerOf(desc)
            if (!marker) continue
            rows.push({ marker, title, description: desc })
          }
          const ri = (hit.props.roadmap_import ?? {}) as Record<string, unknown>
          existing = {
            docId: hit.docId,
            title: hit.title,
            updatedAt: hit.updatedAt,
            lastImportAt: typeof ri.at === "string" ? ri.at : null,
            rows,
          }
        } catch {
          existing = null
        }
      }

      const plan = planWave(roadmap.id, phase, existing)

      if (plan.action === "noop") {
        docs.push({ waveId: phase.id, docId: plan.docId, title: phase.name, status: "noop" })
        continue
      }

      if (plan.action === "conflict") {
        conflicts.push({
          waveId: phase.id,
          docId: plan.docId,
          title: phase.name,
          currentContent: allTitles,
          history: await recentHistory(plan.docId),
        })
        docs.push({ waveId: phase.id, docId: plan.docId, title: phase.name, status: "conflict" })
        continue
      }

      if (plan.action === "create") {
        const waveDocId = await createDoc(phase.name, owner, workspaceId, {
          roadmap_id: roadmap.id,
          wave_id: phase.id,
          roadmap_import: { at: now },
        })
        memberDocs.add(waveDocId)
        const wdoc = await loadDbDoc(waveDocId, credential, "system", allowPg)
        const maps = plan.rows.map((r: PlannedRow) =>
          dbRowToYMap({
            id: newDbRowId(),
            title: r.title,
            status: "Todo",
            priority: "Med",
            assignee: "",
            start: "",
            due: "",
            description: r.description,
            comments: [],
            cells: {},
          } satisfies DbRow),
        )
        wdoc.transact(() => {
          wdoc.getArray<Y.Map<unknown>>("database").push(maps)
        }, "system")
        await saveDbDoc(waveDocId, wdoc, credential, "system")
        rowsAdded += maps.length
        await createWaveThread(
          projectId,
          newId(),
          waveThreadBody(phase.name, waveDocId, phase.timeframe ?? ""),
          createdBy,
          `Wave: ${phase.name}`.slice(0, 200),
        )
        docs.push({ waveId: phase.id, docId: waveDocId, title: phase.name, status: "created" })
        continue
      }

      // update
      const target = ydoc
      if (!target) {
        docs.push({ waveId: phase.id, docId: plan.docId, title: phase.name, status: "skipped" })
        continue
      }
      const byMarker = new Map(plan.toUpdate.map((r) => [r.marker, r]))
      target.transact(() => {
        const arr = target.getArray<Y.Map<unknown>>("database")
        for (const m of arr.toArray()) {
          const desc = typeof m.get("description") === "string" ? (m.get("description") as string) : ""
          const marker = markerOf(desc)
          const want = marker ? byMarker.get(marker) : undefined
          if (want) {
            m.set("title", want.title)
            m.set("description", want.description)
          }
        }
        if (plan.toAdd.length > 0) {
          arr.push(
            plan.toAdd.map((r) =>
              dbRowToYMap({
                id: newDbRowId(),
                title: r.title,
                status: "Todo",
                priority: "Med",
                assignee: "",
                start: "",
                due: "",
                description: r.description,
                comments: [],
                cells: {},
              } satisfies DbRow),
            ),
          )
        }
      }, "system")
      await saveDbDoc(plan.docId, target, credential, "system")
      rowsAdded += plan.toAdd.length
      rowsUpdated += plan.toUpdate.length
      if (plan.retitle) {
        await query(`UPDATE dashboard.workspace_docs SET title = $1, updated_at = now() WHERE id = $2 OR id = $3`, [
          phase.name,
          `workspace:${plan.docId}`,
          plan.docId,
        ])
      }
      await setPropsLineage(plan.docId, { roadmap_import: { at: now } })
      docs.push({ waveId: phase.id, docId: plan.docId, title: phase.name, status: "updated" })
    }

    // 3. Project props: union member docs + lineage.
    const proj = await query(`SELECT props FROM dashboard.workspace_docs WHERE id = $1`, [`workspace:${projectId}`])
    const curProps = ((proj.rows[0] as Record<string, unknown> | undefined)?.props ?? {}) as Record<string, unknown>
    const curMembers = Array.isArray(curProps.projectDocs) ? (curProps.projectDocs as string[]) : []
    const merged = [...new Set([...curMembers, ...memberDocs])].slice(0, 50)
    await setPropsLineage(projectId, { isProject: true, projectDocs: merged, roadmap_id: roadmap.id })

    await recordWorkspaceActivity({
      docId: projectId,
      credential,
      agentType: "system",
      action: "roadmap.imported",
      summary: `Roadmap "${roadmap.title}" → ${docs.filter((d) => d.status === "created").length} new docs, ${rowsAdded} tasks`,
      metadata: { roadmap_id: roadmap.id, rowsAdded, rowsUpdated, conflicts: conflicts.length },
    }).catch(() => {})

    return NextResponse.json(
      {
        projectId,
        docs,
        rowsAdded,
        rowsUpdated,
        conflicts,
        boardUrl: `/workspace/${projectId}?view=board`,
      },
      { status: 201 },
    )
  } catch (error) {
    console.error("[workspace/roadmap-import POST]", error)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}
