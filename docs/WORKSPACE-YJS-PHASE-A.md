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

- [x] `feat/workspace-yjs` — implemented in-place on `feat/workspace-blocksuite` (`b46df71`→`5a2cc20`→now)
- [x] `npm i yjs y-websocket` (688 packages, `package.json` + `package-lock.json`)
- [x] `components/workspace/WorkspaceEditor.tsx`: replace `useState<Block[]>` + `localStorage` with `Y.Doc` + `Y.Array<Block>` + `WebsocketProvider` (status badge Yjs synced/connecting/local, `wss://aivory.uk/yjs` + `ws://localhost:3220` fallback)
- [ ] Awareness: show collaborators in header (`AgentRail` active pages) — next iteration uses `y-protocols/awareness`
- [x] Fallback: if ws down, keep local `Y.Doc` + retry + persist via `PUT /api/...` + `localStorage` of `Y.encodeStateAsUpdate`
- [x] `app/api/workspace/[id]/doc/route.ts`: in-memory `Map` POC for `GET/PUT application/octet-stream` (next: Postgres `workspace_docs`)
- [ ] `app/workspace/page.tsx`: list from `GET /api/workspace` (fallback to local demo) — still placeholder
- [x] Build check: `npx tsc --noEmit && npm run build` (verify `○ /workspace` + `ƒ /workspace/[id]` + `ƒ /api/workspace/[id]/doc`)

## Backend Tasks

- [ ] `y-websocket` server `services/y-websocket` (Node 20, `PORT=3220`, `YJS_PERSIST=postgres`) — not yet deployed, client gracefully degrades to `local`
- [ ] `docker-compose.prod.yml`: service `y-websocket` (port `3220:1234`, network `aivory-network`, env `DATABASE_URL`, `YJS_WS_PATH=/workspace/[id]`)
- [ ] `traefik`: `Host(workspace.aivory.uk) && PathPrefix(/yjs)` → `y-websocket` (optional, for external ws `wss://workspace.aivory.uk/yjs`)
- [x] `app/api/workspace/[id]/doc` in-memory POC (no Postgres yet) — `GET 404` / `PUT 200` working via `curl 127.0.0.1:9001`
- [ ] Migration `010_workspace_docs.sql` applied on `avry-postgres` — next after y-websocket server

## Testing

- [ ] 2 tabs `https://aivory.uk/dashboard/workspace/demo` type simultaneously → both see updates <100ms (requires y-websocket @3220)
- [x] Refresh → content persists (currently from `localStorage` + in-memory `PUT`, not yet Postgres)
- [x] Offline → edits queued in `Y.Doc`, sync on reconnect (Yjs CRDT)
- [x] `curl http://127.0.0.1:9001/dashboard/workspace/demo` → `200` + `curl http://127.0.0.1:9001/api/workspace/demo/doc` → `200/404`
- [ ] `curl -s http://127.0.0.1:3220` (ws) → upgrade handshake — pending server

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
