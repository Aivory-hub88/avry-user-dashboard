# AFFiNE → Aivory Dashboard: Workspace Adoption Spec

> Source: https://github.com/toeverything/AFFiNE (MIT CE + MPL-2.0 BlockSuite)
> Alternative evaluated: https://github.com/AppFlowy-IO/AppFlowy (AGPL-3.0, Flutter+Rust) — rejected for web dashboard (see decision log below).

## Goal
Make `aivory.uk/dashboard` a work management surface (Notion-like) where `Pages` + `Database` are the objects Agents act on, while keeping existing `Console / Mission Control / Agents / Workflows / Diagnostics / Blueprint / Roadmap`.

Live canonical remains `https://aivory.uk` (not `aivory.id`, cf. `traefik/dynamic/canonical-domain-redirect.yml`).

## What to adopt from AFFiNE

### Phase 1 — MVP (this branch)
- **Pages** via `BlockSuite` (`@blocksuite/store` Yjs CRDT) — `paragraph / heading / to-do / callout / code / embed`. NOT full AFFiNE app (`packages/backend` Rust). `MPL-2.0` allows embed.
- **Database** — single engine, 3 views `Table / Kanban / Calendar` backed by one Yjs Doc. First DBs: `Leads`, `Tickets`, `Roadmap`.
- **Workspace + Collections** — `Workspace = tenant workspace`, `Collection = saved filter`. Maps to left rail `Your agents` + `Workspaces` section (reuse `AgentColumn` pattern, recently fixed: `h-12` hairline, `Search` magnifier `f6ff897`).

### Phase 2 — deferred
- `Edgeless Whiteboard`, `Journal`, `Templates gallery`, `Comments`, `AFFiNE AI` (replaced by Aivory Agents).

## Why not AppFlowy
- `AGPL-3.0` → self-hosted SaaS must disclose source to every tenant.
- `Flutter + Rust` → separate service, needs `Postgres+Redis+Minio`, hard to embed in Next.js `avry-user-dashboard:9001`.
- `AFFiNE` = `TypeScript/React + Yjs` → same stack as dashboard, can `import @blocksuite/*` directly.

## Architecture

```
aivory.uk/dashboard          aivory.uk/workspace (new)
Next.js avry-user-dashboard  same Next.js, new routes
├─ OfficeShell (3 cols)      ├─ OfficeShell reused
├─ /console (Chat)           ├─ /workspace → Workspace list
├─ /workflows                ├─ /workspace/[id] → BlockSuite editor (Yjs)
└─ /agents                   └─ Yjs sync: y-websocket @ host.docker.internal:3200
                                 Postgres: workspace_docs(id, yjs_update, owner, workspace_id)
```

- **Do not fork** `toeverything/AFFiNE` full (11k commits). Depend on `BlockSuite` packages only.
- Full AFFiNE self-host (`aivory-workspace:3010`) is optional later as `workspace.aivory.uk` (not in MVP).
- Auth: reuse `JWT_SECRET` / `DATABASE_URL` from `AVRY-V2-Main/.env`.
- Network: `aivory-network` + `aivory_aivory-net` (same as dashboard).

## Agent ↔ Workspace flows

### Console as command bar
```
User in Console (agentTarget=autonomous):
"> Create page Q3 Budget meeting notes in Sales workspace"
→ useIntentRouter → workspace_create
→ POST /api/workspace/[id]/doc {title, template:"meeting"}
→ Yjs Doc created, appears in left rail Workspaces
```
Hero `AgentAvatar type={agentTarget} size={40}` (fix `8bf0b6d`) shows who acts.

### Database operated by agents
```
Leads Qualifier Agent (background):
observe Yjs Database → new row → score BANT → update Score column → move Kanban New→Qualified
→ creates `activity` Notification
→ surfaces in MissionControl as WorkspaceActivity card with Approve/Deny (same NotificationCard)
```

### Rail awareness
- `AgentRail` adds `Active pages` section: `Editing: Q3 Budget · 2 collaborators (Yjs awareness)`.
- `ChatMessage` `prose-aivory` renders `[[Page:Q3 Budget]]` as clickable chip.
- `MissionControl` (existing `EmailAssistantWidget` area) adds `WorkspaceActivity` feed.

### Workflows ↔ Database
`WorkflowCanvas` (@xyflow/react) trigger `Database row added` → `Agent task` (unique to Aivory, AFFiNE has no workflow engine).

## Routes & API (POC)

- `app/workspace/page.tsx` — workspace list placeholder (this branch).
- `app/workspace/[id]/page.tsx` — BlockSuite editor placeholder.
- `app/api/workspace/[id]/doc/route.ts` — GET/PUT Yjs update (next iteration).
- Sidebar: add `Workspace` entry after `Overview` (icon `Layers`).

## Rollout

- Week 1-2: BlockSuite minimal page read/write, Yjs in-memory.
- Week 3-4: Database Table→Kanban, Agent API `createRow/updateField`.
- Week 5-6: Mission Control + AgentRail wiring, approval gate.

## Decision log
- 2026-09-07: Evaluated AFFiNE vs AppFlowy, chose AFFiNE BlockSuite for web embed, AGPL risk, stack fit. Live is `aivory.uk`, dashboard on `avry-user-dashboard:9001`.
