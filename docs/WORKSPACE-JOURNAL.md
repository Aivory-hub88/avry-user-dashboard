# Workspace Journal — Daily Notes + Agent Digest

> Branch: `feat/workspace-journal` from `feat/collab-authz`
> Live (target): `https://aivory.uk/dashboard/workspace/journal/[date]`
> Depends: Phase A Yjs (`y-websocket:3220`), F3-2 bi-directional links (`workspace_doc_links`), F3-1 Cerveau AI Panel, `workspaceActivity.ts`, `workspaceAuth.ts` (authz)
> Source of idea: AFFiNE Journal (deferred in `docs/AFFINE-WORKSPACE-ADOPTION.md` Phase 2), adapted so Cerveau can write into it, not just the user.

## Goal

Satu Page per user per hari (`journal`), auto-terhubung ke setiap Page/Database row yang disentuh hari itu, dan diisi dua arah: manual oleh user (catatan harian ala Notion Journal) dan otomatis oleh Cerveau (ringkasan aktivitas akhir hari, mirip `WorkspaceActivity` card tapi persisten sebagai teks, bukan cuma notification yang hilang setelah di-approve).

## What to build

- **Journal doc = Page biasa**, bukan tipe baru. `workspace_docs.id` pakai konvensi `journal:{workspaceId}:{userId}:{YYYY-MM-DD}`, sisanya (Yjs blocks, BlockSuite editor, history, comments) reuse 100% dari `WorkspaceEditor.tsx`.
- **Auto-link ke sumber aktivitas hari itu**: setiap kali user edit Page X atau ubah row di Database Y pada tanggal T, sistem insert row ke `workspace_doc_links(src=X atau Y, dst=journal:...:T)` — reuse tabel F3-2, `BiDirectionalLinkPanel` yang sudah ada otomatis nampilin "Referenced in Journal 2026-09-10" tanpa kerja UI baru.
- **Agent digest**: di akhir hari (atau on-demand via Console `> ringkas hari ini`), Cerveau kumpulin `workspace_activity` rows milik user hari itu (query `workspaceActivity.ts` yang sudah nyimpen actor/action/summary), generate 1 paragraf ringkasan, append sebagai block ke Y.Doc journal via server-side `Y.Doc` load/apply (pola sama seperti B.3 `POST /api/workspace/[id]/database`, bukan client-side edit).
- **Calendar strip nav**: komponen kecil di atas editor — prev/next day, jump to today, dot indicator kalau tanggal itu punya entry. Tidak perlu view Calendar Database (itu fitur beda, masih out of scope di B).

## Schema

Tidak perlu tabel baru. Tambah 2 kolom nullable ke `workspace_docs` (migration `workspace-journal.sql`):

```sql
-- F5-1: journal flag + date, supaya query "journal user X tanggal Y" tidak parse docId string
ALTER TABLE dashboard.workspace_docs
  ADD COLUMN IF NOT EXISTS is_journal BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS journal_date DATE;

CREATE INDEX IF NOT EXISTS idx_workspace_docs_journal
  ON dashboard.workspace_docs(workspace_id, owner, journal_date)
  WHERE is_journal;
```

`owner` kolom yang sudah ada di `workspace_docs` dipakai sebagai scoping key (1 journal doc per owner per hari), bukan kolom baru.

## Agent wiring

```
Cron (end-of-day, atau manual "> ringkas hari ini" di Console):
GET workspace_activity WHERE actor_id = user.user_id AND created_at::date = today
→ Cerveau summarize (deepseek-v4-flash, sama model yg dipakai brain lain)
→ GET-OR-CREATE journal:{workspaceId}:{userId}:{today} (buat doc kalau belum ada)
→ server-side Y.Doc apply: append block {type:"paragraph", text: summary, source:"agent"}
→ recordWorkspaceActivity(action:"journal_digest", targetType:"journal", targetId:docId)
```

- Approval gate: **tidak perlu** approve/deny seperti Database row — digest cuma nambah 1 block, reversible via History (F4) dan gampang di-edit manual. Kalau nanti mau strict, reuse pola Mission Control card.
- Console command baru: `workspace_journalDigest` di `useIntentRouter` (sama family dengan `workspace_createRow` di B.3).

## API

- `GET /api/workspace/journal/[date]` — get-or-create journal doc untuk `credential.user` di tanggal itu (query param `?workspaceId=`, default `default`), redirect/return `{docId}` → frontend load via existing `/api/workspace/[id]/doc`.
- `POST /api/workspace/journal/[date]/digest` — trigger agent digest manual (dipanggil dari Console intent atau tombol "Ringkas hari ini" di UI). Auth: JWT (user memicu untuk dirinya sendiri) atau `X-Agent-Type` cron internal.
- Auto-link ditulis inline di titik mutasi yang sudah ada (`app/api/workspace/[id]/doc/route.ts` PUT handler dan `app/api/workspace/[id]/database/[rowId]/route.ts` PATCH handler) — tambah 1 `INSERT ... ON CONFLICT DO NOTHING` ke `workspace_doc_links` tiap kali doc/row disentuh, dst = journal hari itu punya actor tsb.

## UI

- `components/workspace/WorkspaceJournalStrip.tsx` (baru) — date nav, taruh di atas `WorkspaceEditor.tsx` saat route `/workspace/journal/[date]`.
- `app/workspace/journal/[date]/page.tsx` (baru) — resolve `date` param → `GET-OR-CREATE` docId → render `WorkspaceEditor` existing dengan docId itu.
- `components/workspace/WorkspaceNavigator.tsx` — tambah entry "Journal" (icon `CalendarDays` dari lucide, konsisten sama `Layers` yang dipakai Workspace) yang default ke hari ini.
- Reuse `WorkspaceAIPanel` pattern untuk tombol "Ringkas hari ini" (bukan komponen baru, cukup 1 quick-action baru di panel yang sudah ada, mirip `Wand2` action lain di situ).

## Tasks

- [ ] `migrations/workspace-journal.sql` — kolom `is_journal`, `journal_date` + index
- [ ] `app/api/workspace/journal/[date]/route.ts` — GET-OR-CREATE
- [ ] `app/api/workspace/journal/[date]/digest/route.ts` — trigger agent digest
- [ ] Auto-link insert di `doc/route.ts` (PUT) dan `database/[rowId]/route.ts` (PATCH)
- [ ] `components/workspace/WorkspaceJournalStrip.tsx` — date nav
- [ ] `app/workspace/journal/[date]/page.tsx`
- [ ] `WorkspaceNavigator.tsx` — entry Journal
- [ ] `useIntentRouter.ts` — intent `workspace_journalDigest` (`> ringkas hari ini`)
- [ ] Test: edit Page → cek row baru di `workspace_doc_links` dst=journal hari ini; trigger digest → block baru muncul di journal, tersimpan di History (F4); 2 hari berturut → 2 doc terpisah, nav prev/next jalan

## Out of scope

- Journal search terpisah dari search Page biasa (kalau search umum belum ada, jangan bikin khusus journal duluan).
- Reminder/notification terjadwal (`> ingatkan aku`) — beda fitur, masuk kategori Task Management bukan Knowledge Base.
- Mobile — dashboard tetap desktop-only.

## Rollout

- Deploy bareng `avry-user-dashboard`, tidak ada infra baru (reuse `y-websocket:3220`, `avry-postgres`).
- Jalankan migration dulu sebelum deploy kode yang baca `is_journal`/`journal_date`.
