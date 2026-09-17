-- Team Space threads/topics/messages (Phase 1, read paths).
-- Applied: docker exec -i avry-postgres psql -U aivory -d aivory < migrations/workspace-space-threads.sql
--
-- Postgres-first (SCOPE D3, 2026-09-17): thread = workload DB
-- (append/query/paginate/redact), bukan CRDT. Yjs tetap khusus isi doc.
-- `page-comments` existing TIDAK dimigrasi — dua sumber kebenaran dipisah
-- tegas: Yjs = blok dokumen, SQL = percakapan.
--
-- Flat: reply selalu menempel ke root id (tidak ada reply-of-reply).
-- Stamp mention server-side saat tulis (lib/spaceProtocol.ts); konsumen
-- (unread/activity/push) hanya baca stamp, tidak pernah re-parse body.

-- Root thread: 1 baris per diskusi. id = root message id.
CREATE TABLE IF NOT EXISTS dashboard.workspace_threads (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_threads_space_time
  ON dashboard.workspace_threads(space_id, created_at DESC);

-- Topic = annotation row di atas thread (judul goal, bukan ringkasan).
-- Max 1 topic per thread (unique partial); hapus topic TIDAK menghapus pesan.
CREATE TABLE IF NOT EXISTS dashboard.workspace_topics (
  id TEXT PRIMARY KEY,
  thread_root TEXT NOT NULL REFERENCES dashboard.workspace_threads(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  archived BOOLEAN NOT NULL DEFAULT false,
  doc_id TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_workspace_topics_one_per_thread UNIQUE (thread_root)
);

CREATE INDEX IF NOT EXISTS idx_workspace_topics_thread
  ON dashboard.workspace_topics(thread_root);

CREATE INDEX IF NOT EXISTS idx_workspace_topics_archived
  ON dashboard.workspace_topics(archived) WHERE archived = false;

-- Pesan: root (thread_root NULL) + replies (thread_root = root id).
-- mentions = agent_type[] yang di-stamp; member_ids = user_id[];
-- here = broadcast; has_agent = (mentions non-empty, kolom `cerval` di TRD);
-- doc_refs = [#..](#doc:id), notify NOL.
-- Delete = tombstone author-only (body → '').
CREATE TABLE IF NOT EXISTS dashboard.workspace_messages (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL,
  thread_root TEXT REFERENCES dashboard.workspace_threads(id) ON DELETE CASCADE,
  author_kind TEXT NOT NULL DEFAULT 'user' CHECK (author_kind IN ('user', 'agent', 'system')),
  author_id TEXT NOT NULL,
  author_name TEXT,
  agent_type TEXT,
  body TEXT NOT NULL DEFAULT '',
  mentions TEXT[] NOT NULL DEFAULT '{}',
  member_ids TEXT[] NOT NULL DEFAULT '{}',
  here BOOLEAN NOT NULL DEFAULT false,
  has_agent BOOLEAN NOT NULL DEFAULT false,
  doc_refs TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_workspace_messages_space_roots
  ON dashboard.workspace_messages(space_id, created_at DESC)
  WHERE thread_root IS NULL;

CREATE INDEX IF NOT EXISTS idx_workspace_messages_thread
  ON dashboard.workspace_messages(thread_root, created_at ASC)
  WHERE thread_root IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workspace_messages_mentions
  ON dashboard.workspace_messages USING GIN (mentions);

-- Read marks: watermark monotone per (space, member, thread?).
-- thread_root = '' berarti level-Space (kolom NOT NULL agar PK valid —
-- Postgres tidak mengizinkan NULL di PRIMARY KEY). Broadcast ephemeral ke
-- device lain; naik saja (updated_at = now()), tidak pernah turun.
CREATE TABLE IF NOT EXISTS dashboard.workspace_read_marks (
  space_id TEXT NOT NULL,
  member TEXT NOT NULL,
  thread_root TEXT NOT NULL DEFAULT '',
  offset_msg TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (space_id, member, thread_root)
);
