-- Room notes (ADR-019 P5): short shared notes inside a room, replacing the
-- old Notion-style pages. Plain text / light markdown; agents read them as
-- room context.
-- Applied: docker exec -i avry-postgres psql -U aivory -d aivory < migrations/room-notes.sql

CREATE TABLE IF NOT EXISTS dashboard.room_notes (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_room_notes_room
  ON dashboard.room_notes(room_id, updated_at DESC)
  WHERE deleted_at IS NULL;
