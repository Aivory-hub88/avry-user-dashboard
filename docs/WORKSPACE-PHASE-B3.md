# Workspace Phase B.3 — Agent Wiring (Leads Agent → Database → Mission Control)

> Branch: `feat/workspace-agent` from `feat/workspace-blocksuite` (`c2647b5` Postgres)
> Live: `https://aivory.uk/dashboard/workspace/demo?view=database`

## Goal
Make `Leads Qualifier Agent` operate the Workspace Database as its work surface, surfaced in `Mission Control` and `Console`, with approval gate.

## Flows

### 1. Console → createRow
```
User in Console (any agent, default Generalist):
"> Add Acme lead (High) to Leads DB"
→ useIntentRouter classify `workspace_createRow`
→ POST /api/workspace/demo/database {title:"Acme lead", priority:"High", status:"Todo", assignee:"Leads Agent"}
→ Yjs Y.Array push → Table/Kanban shows new row <100ms via y-websocket:3220 (http ws 101, wss 200 pending)
```

### 2. Agent → autonomous createRow
```
Leads Qualifier Agent (cron / webhook / manual):
POST /api/workspace/demo/database {title:"Auto lead", ...} with X-Agent-Type: leads_qualifier
→ same Yjs push
→ creates MissionControl WorkspaceActivity
```

### 3. Mission Control card
```
MissionControl.tsx:174 area (below EmailAssistantWidget)
WorkspaceActivity card (NotificationCard tone warn):
[Leads Agent] created "Acme lead" in demo · Todo — needs review
[Approve → move to Doing] [Deny → keep Todo]
Approve → PATCH /api/workspace/demo/database/[rowId] {status:"Doing"} → Kanban moves Todo→Doing
```

## API

- `POST /api/workspace/[id]/database` body `{title, status?, priority?, assignee?, due?}` → `201 {id}` (auth: JWT or X-Agent-Type for agent)
- `PATCH /api/workspace/[id]/database/[rowId]` body `{status, priority, assignee, title, due}` → `200`
- `GET /api/workspace/[id]/database` → `200 {rows: Row[]}` (for Mission Control polling, though Yjs is source of truth)
- Underlying: same `Y.Doc` (`workspace:[id]`) + `dashboard.workspace_docs` BYTEA (reuse `PUT /api/workspace/[id]/doc`). For B.3, API mutates Yjs via server-side Y.Doc load/apply/update (no direct Postgres row table yet).

## UI

- `components/workspace/WorkspaceDatabase.tsx`: already Yjs-backed, no change needed for createRow (addRow already does Yjs push). Will add `onAgentCreate` highlight (pulse `pending-badge-arrived` on new row).
- `components/office/MissionControl.tsx`: add `WorkspaceActivity` section below `EmailAssistantWidget`, polling `GET /api/workspace/demo/database` or Yjs observe (simple poll 5s).
- `app/console/page.tsx`: add `workspace_createRow` intent in `CHIPS` or `useIntentRouter` (reuse `attachContext` pill for demo: `Add to Leads DB`).

## Tasks

- [ ] `app/api/workspace/[id]/database/route.ts` — POST/PATCH/GET (Yjs via `yjs` + `pg` load/apply)
- [ ] `app/api/workspace/[id]/database/[rowId]/route.ts` — PATCH single row
- [ ] `components/office/MissionControl.tsx` — WorkspaceActivity cards with Approve/Deny
- [ ] `hooks/useIntentRouter.ts` or `app/console/page.tsx` — Console `> Add ... to Leads DB` → POST
- [ ] `components/workspace/WorkspaceDatabase.tsx` — highlight new row + Kanban DnD already does status update
- [ ] Test: Console add → Table shows → Kanban → Mission Control card → Approve → Kanban moves

## Out of scope
- Postgres `workspace_rows` normalized table (still Yjs BYTEA), Calendar view, filters, relations.

## Tracking
Checklist above is source of truth. Next: Phase C — Ticket Ops / Generalist + SSO.
