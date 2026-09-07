# Workspace Phase B — Database (Table / Kanban)

> Branch: `feat/workspace-blocksuite` (continuation of Phase A)
> Live: `https://aivory.uk/dashboard/workspace/demo` (Yjs Doc), next `https://aivory.uk/dashboard/workspace/demo?view=database`
> Depends: Phase A Yjs (`y-websocket:3220`, `Y.Doc`)

## Goal
Turn Workspace from doc-only to work management: one `Database` with 3 views (Table / Kanban / Calendar) — AFFiNE parity but focused for Aivory `Leads / Tickets / Roadmap`.

## What to build
- **Database model:** `Y.Map` per row (`id, title, status, priority, assignee, due`), `Y.Array` of rows in same `Y.Doc` (`demo`) under key `database`.
- **Views:**
  - Table: columns `Title | Status | Priority | Assignee | Due` — inline edit, `+ New row`.
  - Kanban: group by `Status` (`Todo / Doing / Done` + custom), drag between columns (no lib, native drag).
  - Calendar: group by `due` (deferred to B.2).
- **Persist:** same `Y.Doc` + `PUT /api/workspace/[id]/doc` (already), no new table yet. Next: `workspace_rows` Postgres.

## Agent wiring (deferred to B.3 but designed now)
- `Leads Qualifier Agent` → `database.createRow({title, status:Todo})` → Kanban `Todo` → agent scores → `updateRow(status=Doing)` → Mission Control card `Approve`.
- Console: `> Add ticket "Login bug" to Tickets DB` → `POST /api/workspace/demo/database`.

## Tasks

- [ ] `components/workspace/WorkspaceDatabase.tsx` — Table + Kanban, Yjs backed, local fallback
- [ ] `app/workspace/[id]/page.tsx` — tabs `Page | Database` (reuse `h-12` header)
- [ ] `app/api/workspace/[id]/database/route.ts` — GET/POST rows (in-memory POC, reuse doc route)
- [ ] Drag Kanban: `onDragStart / onDrop` update `status` in `Y.Array`
- [ ] Build: `npx tsc --noEmit && npm run build` (`○ /workspace`, `ƒ /workspace/[id]`)
- [ ] Test: add row in Table → appears in Kanban, refresh persists, 2 tabs sync via Yjs

## Out of scope (B.2)
- Calendar view, filters, sorts, relations, rollups, CSV import, permissions.

## Rollout
- Deploy same `avry-user-dashboard` + `y-websocket:3220` (no new infra).
- Keep `wss://aivory.uk/yjs` fix in parallel (direct 3220 already 101).
