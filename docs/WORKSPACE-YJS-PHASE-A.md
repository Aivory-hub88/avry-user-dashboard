# Workspace Phase A — Yjs Real-time Sync (Option A)

> Branch: `feat/workspace-blocksuite` → next `feat/workspace-yjs`
> Live preview: `https://aivory.uk/dashboard/workspace/demo` (now localStorage)
> Spec induk: `docs/AFFINE-WORKSPACE-ADOPTION.md`

## Goal
Ganti `localStorage` di `components/workspace/WorkspaceEditor.tsx` menjadi **Yjs CRDT** + `y-websocket` agar `demo` collaborative (2 tab / 2 user) dan persist ke Postgres. Fondasi untuk Database + Agent.

## Stack
- `yjs@13`, `y-websocket@1.5`, `y-protocols`
- Server: `y-websocket` Node (ws) di `host.docker.internal:3220` (hindari 3200 COGNEE)
- Persist: `Postgres avry-postgres (aivory DB)` table `workspace_docs`
- Dashboard: Next.js 16 `avry-user-dashboard:9001` (`basePath: /dashboard`)

## Architecture

```
Browser Tab A ──┐
                 ├─► y-websocket @ 3220 (host.docker.internal) ──► Postgres workspace_docs(yjs_update)
Browser Tab B ──┘                                          │
                                                           └─► /api/workspace/[id]/doc (GET/PUT binary)
```

- Editor: `Y.Doc` per `docId` (`demo`, `…`). `Y.Map` / `Y.Array` untuk blocks.
- Awareness: `y-protocols/awareness` untuk cursor + `AgentRail Active pages`.

## DB Schema

```sql
CREATE TABLE IF NOT EXISTS workspace_docs (
  id TEXT PRIMARY KEY,              -- docId e.g. "demo"
  workspace_id TEXT NOT NULL DEFAULT 'default',
  yjs_update BYTEA NOT NULL,        -- Yjs encoded update
  title TEXT,
  owner TEXT,                        -- JWT sub
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON workspace_docs(workspace_id, updated_at DESC);
```

Migration: `migrations/010_workspace_docs.sql` (add to `avry-postgres`).

## API Contract

- `GET /api/workspace/[id]/doc` → `200 application/octet-stream` (Yjs update) | `404`
- `PUT /api/workspace/[id]/doc` → `body: octet-stream` (Yjs update) → `200 {id, updated_at}` (auth: `JWT`, check `owner` or `workspace member`)
- `GET /api/workspace` → list workspaces/docs for `app/workspace/page.tsx`

All routes behind `requireEnv` + `JWT_SECRET` (same as `avry-backend:8081`).

## Frontend Tasks

- [ ] `feat/workspace-yjs` branch from `feat/workspace-blocksuite` (`4189d7f` base)
- [ ] `npm i yjs y-websocket`
- [ ] `components/workspace/WorkspaceEditor.tsx`: replace `useState<Block[]>` + `localStorage` with `Y.Doc` + `Y.Array<Block>` + `WebsocketProvider`
- [ ] Awareness: show collaborators in header (`AgentRail` active pages)
- [ ] Fallback: if ws down, keep local `Y.Doc` + retry + persist via `PUT /api/...`
- [ ] `app/workspace/page.tsx`: list from `GET /api/workspace` (fallback to local demo)
- [ ] Build check: `npx tsc --noEmit && npm run build` (verify `○ /workspace` still static)

## Backend Tasks

- [ ] `y-websocket` server `services/y-websocket` (Node 20, `PORT=3220`, `YJS_PERSIST=postgres`)
- [ ] `docker-compose.prod.yml`: service `y-websocket` (port `3220:1234`, network `aivory-network`, env `DATABASE_URL`, `YJS_WS_PATH=/workspace/[id]`)
- [ ] `traefik`: `Host(workspace.aivory.uk) && PathPrefix(/yjs)` → `y-websocket` (optional, for external ws `wss://workspace.aivory.uk/yjs`)
- [ ] Migration `010_workspace_docs.sql` applied on `avry-postgres`

## Testing

- [ ] 2 tabs `https://aivory.uk/dashboard/workspace/demo` type simultaneously → both see updates <100ms
- [ ] Refresh → content persists (from Postgres, not localStorage)
- [ ] Offline → edits queued, sync on reconnect
- [ ] `curl http://127.0.0.1:9001/dashboard/workspace/demo` → `200`
- [ ] `curl -s http://127.0.0.1:3220` (ws) → upgrade handshake

## Rollout

1. Deploy `y-websocket` on VPS `tencent-vps` alongside `avry-user-dashboard`.
2. Deploy `feat/workspace-yjs` to `avry-user-dashboard` (same `aivory.uk/dashboard/workspace`).
3. Keep `feat/workspace-blocksuite` as fallback (localStorage POC).

## Tracking

Checklist di atas adalah source of truth untuk Phase A. Update file ini per commit (centang `[x]`). Next phase: Database Kanban (Phase B) setelah checklist ini 100%.

## Risks

- `COGNEE` di `3200` vs `Yjs` di `3220` — jangan bentrok port.
- `y-websocket` tanpa auth awal → tambah `?token=JWT` di `WebsocketProvider` params.
- Binary `BYTEA` besar → batasi `max_update_size` + periodic `Y.encodeStateAsUpdate`.
