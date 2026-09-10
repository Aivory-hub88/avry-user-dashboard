# Collab — y-octo + OctoBase (Option B) — Planning & As-Built

> Full control & rapih — Rust CRDT + pg-backed store, bukan y-websocket Node.
> Status snapshot 2026-09-07 — `main` dashboard `fd15433` live `https://aivory.uk/dashboard/workspace` (200),
> `aivory-collab:3200` healthy di `tencent-vps`, `wss://aivory.uk/yjs` `101` via Cloudflare edge.

## Branch & Commit Map

| Repo | Branch | Head | Isi |
|---|---|---|---|
| `avry-user-dashboard` | `main` | `fd15433` | workspace POC squash `5ae34b3` + API proxy → collab (`71546ca` cherry-pick) |
| `avry-user-dashboard` | `feat/collab-y-octo` | `4a7241b` | rebase `main` + Agent wiring + Calendar + API proxy + MissionControl/AgentRail awareness + doc ini |
| `AVRY-V2-Main` | `feat/collab-y-octo` | `999cb05` | `services/collab` Rust + compose + dashboard bump |

Live: `main` stabil dengan Workspace — `y-websocket:3220` sudah dihapus 2026-09-10, `aivory-collab:3201` single engine (`Up healthy`, `WSS 101` via `aivory.uk/yjs`).

## Goal

Ganti `y-websocket:3220` (Node, in-memory) dengan `aivory-collab:3200` (Rust `yrs` + pg store)
sebagai **single collab engine** untuk `Workspace` (`Pages` + `Database` Table/Kanban/Calendar)
di `https://aivory.uk/dashboard/workspace`, dengan `Cerveau` agent sebagai collaborator CRDT
native (bukan cuma `POST /api/...`).

## As-Built Architecture

```
Browser (Next.js avry-user-dashboard:9001, basePath /dashboard)
  ├─ Y.Doc (yjs 13) per docId — Y.Array blocks + Y.Array database
  ├─ WebsocketProvider (y-websocket compat, NO wasm client — see D2)
  ├─ awareness.user = { name, color, agentType, userId }
  ├─ doc.transact(..., agentType) origin
  └─ wss://aivory.uk/yjs/:room ──► Cloudflare edge
        │  (Worker aivory-uk-reverse-proxy: /yjs* passthrough mentah, see D6)
        └─► Traefik websecure 443, PathPrefix(/yjs) priority 100 ──► aivory-collab:3200
              ├─ yrs 0.17 CRDT merge (y-protocols sync step1/step2/update + awareness broadcast)
              ├─ OctoBase pg store: dashboard.workspace_docs, room-keyed (lazy-load + 300ms debounce flush)
              ├─ legacy BYTEA merge on first access (built-in yjs→OctoBase migration, see D4)
              └─ HTTP GET/PUT /api/workspace/:id/doc (X-Agent-Type) untuk Next.js API proxy

Next.js API (avry-user-dashboard, COLLAB_URL=http://aivory-collab:3200, timeout 2s, fallback pg):
  GET /api/workspace/[id]/doc      → collab dulu, fallback pg BYTEA (header X-Source)
  PUT /api/workspace/[id]/doc      → collab (X-Agent-Type) + pg upsert → { source: collab+pg }
  POST /api/workspace/[id]/database → loadDoc (collab-first) + transact origin agentType + saveDoc (collab+pg)
```

## Decision Log (As-Built ≠ Rencana Awal)

- **D1 — `yrs 0.17`, bukan crate `y-octo`/`octobase`.** Crate `y-octo` tidak ada di crates.io dalam bentuk itu;
  `yrs` adalah implementasi Rust Yjs yang wire-compat dengan `yjs 13` (sync state-vector/update V1).
  Store "OctoBase" diimplementasi sebagai pg-backed room store (`dashboard.workspace_docs`),
  bukan crate OctoBase. Nama konsep dipertahankan, implementasi pragmatis.
- **D2 — Tanpa `@toeverything/y-octo` wasm di client.** Provider `y-websocket` JS sudah speak
  `y-protocols` yang dimengerti server `yrs`; wasm `~200KB` tidak memberi nilai tambah untuk fase ini.
- **D3 — Dual-write collab + pg (bukan cutover).** Dashboard tetap upsert `pg BYTEA` sebagai fallback;
  collab flush room-keyed (`workspace:{id}`). `GET` prefer collab → fallback pg. Drop `BYTEA` ditunda (scope tersisa).
- **D4 — Migrasi = lazy merge, tanpa script terpisah.** `ensure_room` load row room-keyed, lalu merge
  legacy row bare-docId (`octo-test-1`) sekali saat first access. Tidak ada `migrate_yjs_to_octo.rs`.
- **D5 — Routing `PathPrefix(/yjs)` priority `100`, tanpa Host.** CF Worker me-rewrite Host origin
  menjadi `aivory.id`, sehingga rule `Host(aivory.uk)` tidak match untuk traffic via CF.
  PathPrefix-only + priority 100 menang atas `y-websocket` (default ~37) & `main-app` (1).
- **D6 — CF Worker bypass `/yjs`.** Worker `aivory-uk-reverse-proxy` (`aivory.uk/*`) membungkus origin
  response dalam `new Response()` → throw untuk status `101` (CF `1101`). Fix: `return fetch(request)`
  mentah untuk `/yjs` + `/yjs/*`. Source mirror: `services/collab/edge-worker.js`. Backup: VPS `/tmp/rp.js.bak`.
- **D7 — VPS host port `3201:3200`.** Port `3200` host dipakai `cerveau-server` (host network);
  repo compose tetap `3200:3200` untuk lokal. Traefik internal tetap `3200`.
- **D8 — Toolchain `rust:1.89`.** `1.75` gagal (`getrandom edition2024`), `1.82` gagal (transitif `idna`
  butuh ≥1.86 via `sqlx`), `1.85` OK tanpa `sqlx`, `1.89` OK dengan `sqlx 0.7`.
- **D9 — `yrs Transaction` is `!Send`.** Semua transaksi di-scope dalam block `{}` agar tidak ada
  borrow yang menyeberang `.await` (explicit `drop()` tidak cukup untuk borrowck di async fn).

## Tech Stack (As-Built)

| Layer | Choice | Note |
|---|---|---|
| **CRDT server** | `yrs 0.17` + `axum 0.7` ws + `tokio` | `y-protocols` compat `yjs 13`, `DashMap` rooms + `broadcast` per room |
| **Store** | `avry-postgres` `dashboard.workspace_docs` (`BYTEA`) | room-keyed rows + legacy bare-id rows; `sqlx 0.7`, `connect_lazy`, debounce flush 300ms |
| **Server** | `aivory-collab` Rust `1.89`, image `avry-v2-main-aivory-collab` | `EXPOSE 3200`, `/health` + `/info`, env `PORT/DATABASE_URL/JWT_SECRET/OCTOBASE_PATH` |
| **Client** | `yjs 13` + `y-websocket` (tanpa wasm) | `awareness.user {name,color,agentType,userId}`, `transact` origin `agentType`, `peers` badge |
| **Infra** | `aivory-network`, Traefik `web,websecure`, CF proxied `aivory.uk → 129.226.155.216` | `ssl=full`, `websockets=on`, Worker bypass `/yjs` |
| **AuthN/Z** | `X-Agent-Type` (+ `X-User-Id`) via WS header & HTTP | `JWT`/RBAC per-workspace: scope tersisa (belum di-enforce di collab) |

## Tracking Checklist

- [x] `feat/collab-y-octo` branch (dashboard + root)
- [x] `services/collab` Rust skeleton (`Cargo.toml` + `Dockerfile` + `src/main.rs`)
- [x] `aivory-collab` `Up (healthy)` di `tencent-vps`, pool `OctoBase pg store: ready`
- [x] `WorkspaceEditor`/`WorkspaceDatabase` `awareness` `agentType` + `peers` + `transact` origin
- [x] `app/api/workspace/[id]/doc` + `database` proxy → collab (`X-Agent-Type`) + pg fallback (live di `main fd15433`)
- [x] Migrasi lazy (legacy BYTEA merge) — terbukti: restart container → `GET 200 174B` via lazy-load
- [x] `MissionControl` + `AgentRail` tampil `agentType` collaborator (`Active in Workspace`)
- [x] `wss://aivory.uk/yjs` `101` direct origin DAN via Cloudflare edge (Worker bypass, apex `200` + `www→301` intact)
- [ ] Merge `feat/collab-y-octo` → `main` (root + dashboard) → stable
- [ ] Drop `dashboard.workspace_docs` legacy rows + `y-websocket:3220` setelah 1 release stabil

## Scope Tersisa (IN)

1. **Merge → main.** Root `feat/collab-y-octo` (`999cb05`) + dashboard `feat/collab-y-octo` (`4a7241b`)
   → `main` → redeploy VPS → `https://aivory.uk/dashboard` stabil.
2. **Stabilisasi 1 release**, lalu drop legacy bare-id rows + hentikan `y-websocket:3220`.
3. **AuthZ collab.** Enforce `JWT` + RBAC per `workspace_id` di WS upgrade & HTTP API
   (sekarang `X-Agent-Type` trusted, tanpa verifikasi).
4. **Rotasi token Cloudflare.** Token di chat terekspos → rotate di CF dashboard, update
   `CF_EDGE_TOKEN_USER` di VPS `.env`, hapus token lama. (`cfk_` tidak valid sebagai Bearer — klarifikasi/rotasi juga.)
5. **Observabilitas.** Log `actor` per flush sudah ada; tambah `prometheus` metrics bila perlu.

## Explicit Non-Goals (OUT)

- Migrasi `BlockSuite` editor (tetap `contentEditable` + `yjs` binding sekarang).
- Client wasm `@toeverything/y-octo`.
- `Redis` pub/sub antar-replika (single replica sekarang; `broadcast` in-process cukup).
- `time-travel` UI / history API (store punya `updated_at`; versi per-update belum disimpan).
- Sharding `OctoBase` per `workspace_id` (scale-out belum dibutuhkan).

## Ops Runbook (ringkas; detail: `services/collab/README.md`)

```bash
# deploy collab (VPS tencent-vps, ~/.ssh/claude_code_vps, -p 63222)
cd ~/AVRY-V2-Main
docker compose -f docker-compose.prod.yml build aivory-collab
docker compose -f docker-compose.prod.yml up -d --force-recreate aivory-collab
curl -s http://localhost:3201/health                                  # aivory-collab ok 3200 y-octo
docker exec avry-postgres psql -U aivory -d aivory \
  -c "select id, octet_length(yjs_update), updated_at from dashboard.workspace_docs order by updated_at desc limit 5"
# wss via CF edge (harus 101):
curl --http1.1 -k -m 8 -i -N -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: x3JJHMbDL1EzLkh9GBhXDw==' \
  https://aivory.uk/yjs/<room>
```

Secrets: token Cloudflare HANYA di VPS `~/AVRY-V2-Main/.env` (`CF_EDGE_TOKEN_USER`, `600`,
gitignored) — jangan hardcode, jangan commit. Script diagnosis di `/tmp/cf_*.sh` (bukan repo).

## Risks (update)

- Build Rust `>10 mnt` di VPS saat tambah dep besar (`sqlx` + `ring`); gunakan background build + poll.
- VPS load tinggi saat compile → SSH bisa timeout sesaat; `uptime`/retry.
- `sqlx 0.7` future-incompat warning — pin revisi bila toolchain naik.
- CF Worker adalah config edge di luar repo — mirror di `services/collab/edge-worker.js` wajib dijaga sinkron.
