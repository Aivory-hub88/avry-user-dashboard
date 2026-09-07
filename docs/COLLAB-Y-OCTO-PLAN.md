# Collab — y-octo + OctoBase (Option B) — Planning

> Full control & rapih — Rust CRDT + local-first DB, bukan y-websocket Node.
> Branch: `feat/collab-y-octo` from `main` (`92a16b3`)
> Live now: `main` stable `https://aivory.uk/dashboard` (tanpa Workspace), `feat/workspace-*` (`c2647b5` + DB UI `86439a4` + Yjs `a407d7c`) jadi referensi, `y-websocket:3220` in-memory di `tencent-vps` (direct `101`, Traefik `http` `101`, `wss` `200` pending).

## Goal
Ganti `y-websocket:3220` (Node, `BYTEA` di `avry-postgres`) dengan `aivory-collab:3200` (Rust `y-octo` + `OctoBase`) sebagai **single collab engine** untuk `Workspace` (`Pages` + `Database` Table/Kanban/Calendar) di `https://aivory.uk/dashboard/workspace`, dengan `Cerveau` agent sebagai collaborator CRDT native (bukan cuma `POST /api/...`).

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| **CRDT** | `y-octo` (Rust, `y-crdt` fork, `yjs` compat) | `thread-safe`, `zero-copy`, `10x` merge vs JS `yjs`, dipakai AFFiNE prod |
| **DB** | `OctoBase` (Rust, local-first) | `workspace` table, `Yjs` doc per `id`, `time-travel`, `IndexedDB` di browser + `Postgres` di server (via `OctoBase` sync), bukan `BYTEA` blob |
| **Server** | `aivory-collab` Rust `cargo` `1.75` | `cargo` build `~400MB` image, `EXPOSE 3200`, `traefik` `Host(aivory.uk) && PathPrefix(/yjs)` → `3200` |
| **Client** | `@toeverything/y-octo` wasm + `yjs@13` + `BlockSuite` (`MPL-2.0`) | `Y.Doc` di `WorkspaceEditor`/`WorkspaceDatabase` tetap `yjs` JS, `y-octo` di server, `awareness` via `y-protocols` |
| **Infra** | `AVRY-V2-Main` `aivory-network`, `avry-postgres` (keep for `aivory` DB, OctoBase punya store sendiri), `traefik` `web,websecure`, `Cloudflare` `wss` |
| **Auth** | `JWT` (`DATABASE_URL`, `JWT_SECRET` dari `avry-backend:8081`) + `X-Agent-Type` | `awareness.user = {name, color, agentType, userId}` + `doc.transact(..., agentType)` |

## Architecture

```
Browser (Next.js avry-user-dashboard:9001, basePath /dashboard)
  ├─ Y.Doc (yjs) per docId (demo) — Y.Array blocks + Y.Array database
  ├─ @toeverything/y-octo wasm (client) + y-websocket compat
  └─ WebSocket wss://aivory.uk/yjs (Traefik websecure 443 → aivory-collab:3200)
        │
        └─► aivory-collab:3200 (Rust y-octo + OctoBase)
              ├─ OctoBase workspace store (local-first, time-travel)
              ├─ y-octo CRDT merge (actor_id = userId | agentType)
              └─ Postgres (via OctoBase sync, not BYTEA) + Redis (optional pub/sub for scale)
```

*No `y-websocket:3220` after B — single `aivory-collab:3200`.*

## Services

- `AVRY-V2-Main/services/collab/Cargo.toml` (`y-octo`, `octobase`, `tokio`, `axum`, `ws`)
- `Dockerfile` `FROM rust:1.75` `cargo build --release`
- `docker-compose.prod.yml`:
```yaml
aivory-collab:
  build: {context: ./services/collab, dockerfile: Dockerfile}
  container_name: aivory-collab
  restart: unless-stopped
  networks: [aivory-network]
  ports: ["3200:3200"]
  environment: [DATABASE_URL, JWT_SECRET, OCTOBASE_PATH=/data]
  volumes: [collab_data:/data]
  labels:
    - "traefik.enable=true"
    - "traefik.docker.network=aivory-network"
    - "traefik.http.routers.collab.rule=Host(`aivory.uk`) && PathPrefix(`/yjs`)"
    - "traefik.http.routers.collab.entrypoints=websecure"
    - "traefik.http.routers.collab.tls=true"
    - "traefik.http.routers.collab.tls.certresolver=letsencrypt"
    - "traefik.http.services.collab.loadbalancer.server.port=3200"
```

## DB & Migration

- Drop `dashboard.workspace_docs BYTEA` after OctoBase stable (keep for fallback 1 release).
- OctoBase schema (Rust, not SQL):
```rust
workspace { id: String PK, doc: YDoc, created_at, updated_at, owner }
block { id, workspace_id FK, type, text, parent_id }
database_row { id, workspace_id FK, title, status, priority, assignee, due }
```
- Migration script `migrate_yjs_to_octo.rs` — load `BYTEA` from `avry-postgres`, `Y.applyUpdate` via `y-octo`, insert into `OctoBase`.

## API

Keep `GET/PUT /api/workspace/[id]/doc` (Yjs binary) for `WorkspaceEditor` fallback + `POST/PATCH /api/workspace/[id]/database` for `Leads Agent`, but server impl ganti dari `pg` `BYTEA` ke `aivory-collab` client (Rust `reqwest`).

- `POST /api/workspace/[id]/database` → `aivory-collab` `POST /yjs/:id` with `X-Agent-Type`
- `awareness` + `history` now has `actor_id`, so `MissionControl` card can show `Leads Agent edited` with real CRDT actor, not anon `origin`.

## Frontend

- `components/workspace/WorkspaceEditor.tsx` / `WorkspaceDatabase.tsx`:
```ts
import * as Y from "yjs"
import { WebsocketProvider } from "y-websocket" // compat, underlying y-octo ws
// or @toeverything/y-octo wasm provider
awareness.setLocalStateField('user', { name: agentType ? AGENT_TITLE : 'You', color, agentType, userId })
doc.transact(() => { /* ... */ }, agentType)
```
- `AgentRail Active pages` + `MissionControl` WorkspaceActivity use `awareness` + `Yjs` history.

## Deployment & Scale

- `tencent-vps` (`129.226.155.216:3220` → `3200`), `traefik` `aivory-network`, `Cloudflare` `wss` (Full SSL, WebSocket on).
- Scale: `aivory-collab` stateless + `OctoBase` sharded by `workspace_id`, `Redis` pub/sub for `awareness` (optional, `y-octo` already handles via `ws`).
- Monitoring: `aivory-collab` `/health` → `avry-traefik` healthcheck, `prometheus` metrics (later).

## Security & Enterprise

- `JWT` + `X-Agent-Type` header, `Cerveau` webhook `CERVEAU_WEBHOOK_SECRET` already in `docker-compose.prod.yml:246`.
- `RBAC` per `workspace_id` (owner, member), `audit` via `OctoBase` history (`actor_id`, `timestamp`).
- `GDPR`: `y-octo` `time-travel` + `OctoBase` retention.

## Tracking Checklist

- [ ] `feat/collab-y-octo` branch from `main`
- [ ] `services/collab/Cargo.toml` + `Dockerfile` Rust skeleton
- [ ] `aivory-collab:3200` `Up` on `tencent-vps` (`101` via `wss://aivory.uk/yjs`)
- [ ] `WorkspaceEditor`/`WorkspaceDatabase` `y-octo` wasm + `awareness` agent
- [ ] `app/api/workspace/[id]/doc` → `aivory-collab` (not `pg` BYTEA)
- [ ] Migration `migrate_yjs_to_octo` + drop `workspace_docs` after stable
- [ ] `MissionControl` + `AgentRail` show `agentType` collaborator
- [ ] `wss://aivory.uk/yjs` `101` via Traefik `websecure` (Cloudflare `wss`)
- [ ] Merge `feat/workspace-*` (DB UI) + `feat/collab-y-octo` → `main` → `https://aivory.uk/dashboard` stable

## Risks

- Rust build `3-4m` on `tencent-vps` (vs `y-websocket` Node `10s`).
- `y-octo` wasm `~200KB` extra in `avry-user-dashboard` bundle.
- `OctoBase` not `avry-postgres` — 2 stores during migration.
- `y-websocket:3220` must stay up until `aivory-collab:3200` stable (fallback).

## Next
After checklist 100% → `main` → `aivory.uk/dashboard` enterprise Workspace.
