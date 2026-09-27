-- Dated, addressed room notes for the project timeline (ADR-019 P6).
-- A note can sit on a day (on_date) and be meant for one person or agent
-- in the room (for_kind + for_id; for_name is the label at the time it was
-- set). Undated notes stay exactly as before.
-- Applied: docker exec -i avry-postgres psql -U aivory -d aivory < migrations/room-notes-calendar.sql

ALTER TABLE dashboard.room_notes ADD COLUMN IF NOT EXISTS on_date DATE;
ALTER TABLE dashboard.room_notes ADD COLUMN IF NOT EXISTS for_kind TEXT;
ALTER TABLE dashboard.room_notes ADD COLUMN IF NOT EXISTS for_id TEXT;
ALTER TABLE dashboard.room_notes ADD COLUMN IF NOT EXISTS for_name TEXT NOT NULL DEFAULT '';

DO $$ BEGIN
  ALTER TABLE dashboard.room_notes ADD CONSTRAINT room_notes_for_kind
    CHECK (for_kind IS NULL OR (for_kind IN ('member', 'agent') AND for_id IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_room_notes_dated
  ON dashboard.room_notes(room_id, on_date)
  WHERE on_date IS NOT NULL AND deleted_at IS NULL;
