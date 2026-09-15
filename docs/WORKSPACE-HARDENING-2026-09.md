# Workspace Hardening — September 2026

> Scope: `avry-user-dashboard`'s Workspace feature (`app/workspace/**`, `app/api/workspace/**`, `lib/workspace*.ts`).
> Not a forward plan like the other `WORKSPACE-PHASE-*.md` docs — this is a record of what shipped: two DB migrations applied directly to production, then a code-review pass (spawned as two research agents) that surfaced 10 concrete issues, of which 6 were fixed this round. All changes deployed to `aivory-prod` (tencent-vps) and pushed to `main`.
> Commit range: `9795da4..015ec9d` on `Aivory-hub88/avry-user-dashboard`.

## Why

`GET /api/workspace` was doing up to 3 sequential queries per doc row (N+1) — a 100-doc list meant up to 300 queries. Two migrations (list-covering indexes + an append-only event log) were applied to production, then a wider read-through of the workspace feature turned up a ranked list of further issues. This doc records what each one was, why it mattered, and what changed.

## 1. Database migrations (applied directly to `aivory-prod`, before any code changes)

### `migrations/workspace-list-index.sql`
4 indexes covering the doc-list query path:
- `idx_workspace_docs_list` — `(updated_at DESC) INCLUDE (id, workspace_id, owner, title)`, a covering index for the list's `ORDER BY updated_at DESC`.
- `idx_workspace_doc_acl_user` — `(user_id, doc_id)`, for the batched ACL lookup (`WHERE doc_id = ANY($1) AND user_id = $2`).
- `idx_workspace_docs_owner` — `(owner) WHERE owner IS NOT NULL`, owner fast-path in batch role resolution.
- ~~`idx_workspace_members_ws_user`~~ — dropped after landing: it duplicated the existing `workspace_members_pkey (workspace_id, user_id)` exactly (same columns, same order), so the planner never used it. Removed from the migration file and the live index dropped in production (commit `9795da4`).

### `migrations/workspace-events.sql` + `migrations/workspace-events-hash-chain.sql`
New table `dashboard.workspace_events`: a Buzz-style (block/buzz on GitHub) append-only log — every action is one row (`kind` + JSONB `payload`), new feature = new `kind` string, old readers ignore what they don't recognize. `recordWorkspaceActivity` dual-writes into it alongside the pre-existing `workspace_activity` table. Backfilled 1:1 from `workspace_activity` on migration (105/105 rows).

Each row also carries a SHA-256 hash chained to the previous row **within its `workspace_id`** (per-tenant, mirroring Buzz's per-community audit chain) — tampering with or deleting a row breaks every hash after it. Writes take `pg_advisory_xact_lock(hashtext(workspace_id))` so concurrent writers can't race and fork the chain. `verifyWorkspaceEventChain(workspaceId)` in `lib/workspaceEvents.ts` recomputes and checks a workspace's whole chain on demand — not wired to any UI yet.

A real correctness bug was caught and fixed before this shipped: the hash inputs (`created_at`, `payload`) must use Postgres's own `::text` cast, not JS's `toISOString()` / `JSON.stringify()` — the two don't round-trip byte-for-byte, which would have made the chain look tampered with no tampering ever happening.

## 2. Fixes from the code-review pass

Ten findings came out of a dedicated read-through of the feature (see conversation history for the full list); six were fixed and deployed. The other four are open — see **Remaining / not done** below.

### Security — fail-open gap for database-type docs (`b9639fe`)
`authorizeDocFallback` (`lib/workspaceAuth.ts`) and `canManageDoc` (`lib/workspaceAccess.ts`) only matched 2 of the 4 id forms a doc can be stored under (bare, `workspace:`) — missing `workspace:db:` and `db:`, the CRDT room forms for database-type docs (already handled correctly by `app/api/workspace/[id]/route.ts`'s delete/restore). A database doc read through the missed forms looked like "0 rows", and in `authorizeDocFallback` that's the explicit fail-open branch for new docs — so **an existing, owned database doc could get treated as brand new and claimed by any authenticated user during a collab outage.** Fixed to the same 4-form match used elsewhere.

### Correctness — blind overwrite in `saveDbDoc` (`d558b49`)
`saveDbDoc` (`lib/workspaceDb.ts`) always upserted the pg `yjs_update` column regardless of whether the collab PUT actually succeeded. When collab is unreachable or its PUT fails for a non-auth reason, that upsert was a blind overwrite of whatever was already in pg — two concurrent writers hitting the same outage window would silently stomp each other (last write wins) instead of converging, unlike `loadDbDoc`'s own merge path. Now reads and merges the currently-persisted state onto the doc before re-encoding and writing, same as `loadDbDoc` already does on read.

### Performance — search endpoint serial ACL + decode (`a59af46`)
`GET /api/workspace/search` ran `canReadDocId` per title candidate (up to 50 sequential `await`s) and, for the top ones, `authorizeDocFallback` + `loadDbDoc` one at a time — each `loadDbDoc` up to 2s on a collab timeout. Worst case: 20+ × 2s+ serial, turning every search-as-you-type keystroke into a multi-second hang during a collab hiccup. ACL gating is now one batched resolution (`getDocRolesBatch` for users, a single `doc_id = ANY($1)` query for service+agent); doc decode now runs via `Promise.all`, still capped at `MAX_DOCS_DECODED`. Trade-off: no longer exits early once `MAX_RESULTS` hits exist mid-decode — acceptable since decode is parallel now, not stacked.

### Performance — rollup target-doc loads serial (`fff5480`)
`withResolvedRollups` (`lib/workspaceDb.ts`) loaded each distinct rollup target doc one at a time. A database view with 3-4 rollup relations turned a normal row fetch into several seconds of serial latency. Now fans out with `Promise.all`.

### Performance — mention fan-out sequential inserts (`569399d`)
`recordCommentMentions` (`lib/workspaceMentions.ts`) looped over parsed `@agent`/`@email` mentions with one awaited `INSERT` each — up to 40 sequential round trips (`parseMentions` caps agents+emails at 20 each), blocking the comment/description save until all of them finished. Now one `INSERT ... SELECT ... FROM unnest($kinds, $ids)` covers every mention in a single round trip.

### Correctness/UX — silent 100-doc cap on the list (`4e33585`)
`GET /api/workspace` hard-capped at `LIMIT 100` with no way to see or fetch past it — a workspace with more docs than that just stopped showing the older ones, indistinguishable from data loss. Added keyset pagination on `(updated_at, id)` with an opaque base64url cursor. The raw fetch is padded above the requested page size because dedup (bare + `workspace:`-prefixed rows) and per-doc ACL filtering both shrink the visible count below what's fetched — pagination continues from the **last raw row**, not the last visible one, so nothing gets skipped regardless of how much either filter drops. Default page size stays 100 (matches the old cap) so existing workspaces see no behavior change; "Load more" (`app/workspace/page.tsx`) only appears past that, for both the Pages and Trash lists.

### Code quality — duplicate `workspaceOf()`, double-fetched WIP/field defs (`015ec9d`)
- `lib/workspaceMentions.ts` had its own private copy of `workspaceOf()`, verbatim identical to the one already exported from `lib/workspaceIndex.ts`. Now imports the shared one.
- `POST /api/workspace/[id]/database` (`app/api/workspace/[id]/database/route.ts`) awaited `getWipLimits(id)` and `getFieldDefs(id)` twice each in the same handler — each its own round trip to the same doc's `props` column, with nothing in between that could have changed the value (the Y.Doc `transact` doesn't touch pg `props`). Fetched once, reused everywhere in the handler.

## 3. Test changes

- `app/api/workspace/route.test.ts` — new, 4 cases covering cursor pagination: no cursor when the raw fetch comes up short, an opaque cursor when the raw fetch fills the padded limit, the cursor round-tripping into the next query's composite `WHERE` clause, and a malformed cursor being ignored rather than 500ing.
- All 12 route test files that mock `@/lib/db` now also mock `withTransaction` (`764d084`) — `recordWorkspaceEvent`'s audit-log writes run through it, and without the mock the real function threw "No withTransaction export", silently swallowed by `recordWorkspaceEvent`'s own fire-and-forget try/catch but noisy on every write-path test.
- `app/api/workspace/search/route.test.ts` and `app/api/workspace/[id]/database/[rowId]/route.test.ts` had assertions updated to match new query/param shapes (`doc_id = ANY($1)` array instead of a single id; mention insert params now carry `kinds`/`ids` arrays instead of one flat value per row).

Full suite: **60/60 passing** as of `015ec9d`.

## 4. Deployment record

Every change in this doc was rebuilt and redeployed to `aivory-prod` (tencent-vps) individually — `docker compose build avry-user-dashboard` → `up -d avry-user-dashboard` → verified container health + a live smoke request — before being committed to git, since the live checkout at `/home/ubuntu/AVRY-V2-Main/frontend/avry-user-dashboard` is a manually-synced copy, not a git clone (see `docs/COLLAB-Y-OCTO-PLAN.md` or ask in-session for that drift's history). Each commit above was pushed to `main` on `Aivory-hub88/avry-user-dashboard` immediately after its production deploy was confirmed healthy.

## 5. Remaining / not done

From the same review pass, not yet acted on:

- **Vector search has no ANN index** (`migrations/workspace-chunks.sql`) — the migration's own comment already flags this ("add HNSW later if rows ever approach six figures"). Semantic search does a full table scan + exact cosine distance today. Not urgent at current row counts.
- **`workspace_mention_reads` can only express a global watermark per reader** (`PRIMARY KEY (reader_kind, reader_id)`, one `read_at`) — no way to mark one older mention read while leaving newer ones unread, or re-surface a specific mention. This is a schema limitation, not a bug; needs a product decision (is per-mention read state actually wanted?) before it's worth a join-table migration.

## Reference

- Migrations: `migrations/workspace-list-index.sql`, `migrations/workspace-events.sql`, `migrations/workspace-events-hash-chain.sql`
- Event log + hash chain: `lib/workspaceEvents.ts`
- Core files touched: `lib/workspaceAccess.ts`, `lib/workspaceAuth.ts`, `lib/workspaceDb.ts`, `lib/workspaceMentions.ts`, `lib/workspaceIndex.ts`, `app/api/workspace/route.ts`, `app/api/workspace/search/route.ts`, `app/api/workspace/[id]/database/route.ts`, `app/workspace/page.tsx`
