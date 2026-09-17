/**
 * Roadmap → project import — Phase 4 (F6, killer flow).
 *
 * Mapping (TRD §6, diadaptasi ke AiryRoadmap): phase (wave) → 1 member doc,
 * milestone (deliverable) → 1 task row (Todo/Med, description terbawa).
 * Lineage: props {roadmap_id, wave_id, roadmap_import:{at}} di doc,
 * marker `<!-- roadmap:<rid>:<mid> -->` di description row.
 *
 * Idempotent: import ulang dengan roadmap_id sama = update (match wave_id +
 * marker), bukan duplikat. Conflict: wave doc berubah sejak import terakhir
 * DAN import ingin mengubahnya → kembalikan currentContent + history,
 * TIDAK pernah silent overwrite.
 */

import { z } from "zod";

export const RoadmapMilestoneSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional().default(""),
});

export const RoadmapPhaseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  timeframe: z.string().optional().default(""),
  description: z.string().optional().default(""),
  milestones: z.array(RoadmapMilestoneSchema).default([]),
});

export const RoadmapImportSchema = z.object({
  roadmap: z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    phases: z.array(RoadmapPhaseSchema).min(1).max(50),
  }),
  projectId: z.string().min(1).max(128).optional(),
});

export type RoadmapImportInput = z.infer<typeof RoadmapImportSchema>;
export type RoadmapPhase = z.infer<typeof RoadmapPhaseSchema>;

/** Marker lineage di description row — tak terlihat bila dirender markdown. */
export function rowMarker(roadmapId: string, milestoneId: string): string {
  return `<!-- roadmap:${roadmapId}:${milestoneId} -->`;
}

export function rowDescription(marker: string, desc: string): string {
  return desc ? `${marker}\n${desc}` : marker;
}

export interface ExistingRow {
  marker: string;
  title: string;
  description: string;
}

export interface ExistingWave {
  docId: string;
  title: string;
  /** ISO updated_at doc. */
  updatedAt: string;
  /** ISO import terakhir (props.roadmap_import.at), null bila tak tercatat. */
  lastImportAt: string | null;
  rows: ExistingRow[];
}

export interface PlannedRow {
  marker: string;
  milestoneId: string;
  title: string;
  description: string;
}

export type WavePlan =
  | { action: "create"; phase: RoadmapPhase; rows: PlannedRow[] }
  | { action: "noop"; phase: RoadmapPhase; docId: string }
  | {
      action: "update";
      phase: RoadmapPhase;
      docId: string;
      retitle: boolean;
      toAdd: PlannedRow[];
      toUpdate: PlannedRow[];
    }
  | {
      action: "conflict";
      phase: RoadmapPhase;
      docId: string;
      currentContent: string[];
      wanted: PlannedRow[];
    };

function plannedRows(roadmapId: string, phase: RoadmapPhase): PlannedRow[] {
  return phase.milestones.map((m) => {
    const marker = rowMarker(roadmapId, m.id);
    return {
      marker,
      milestoneId: m.id,
      title: m.title.slice(0, 100),
      description: rowDescription(marker, (m.description ?? "").slice(0, 800)),
    };
  });
}

/**
 * Rencanakan 1 wave murni (tanpa IO) — unit-testable penuh.
 * Aturan conflict: doc berubah sejak import terakhir (updatedAt >
 * lastImportAt) DAN ada yang ingin diubah → conflict, bukan overwrite.
 */
export function planWave(
  roadmapId: string,
  phase: RoadmapPhase,
  existing: ExistingWave | null,
): WavePlan {
  const rows = plannedRows(roadmapId, phase);
  if (!existing) return { action: "create", phase, rows };

  const byMarker = new Map(existing.rows.map((r) => [r.marker, r]));
  const toAdd = rows.filter((r) => !byMarker.has(r.marker));
  const toUpdate = rows.filter((r) => {
    const cur = byMarker.get(r.marker);
    return cur !== undefined && (cur.title !== r.title || cur.description !== r.description);
  });
  const retitle = existing.title !== phase.name;
  if (toAdd.length === 0 && toUpdate.length === 0 && !retitle) {
    return { action: "noop", phase, docId: existing.docId };
  }
  const modified =
    !!existing.lastImportAt && existing.updatedAt > existing.lastImportAt;
  if (modified) {
    return {
      action: "conflict",
      phase,
      docId: existing.docId,
      currentContent: existing.rows.map((r) => r.title),
      wanted: rows,
    };
  }
  return { action: "update", phase, docId: existing.docId, retitle, toAdd, toUpdate };
}

/** Thread root untuk wave doc baru: referensi #doc, tanpa mention (tanpa spam run). */
export function waveThreadBody(phaseName: string, waveDocId: string, timeframe: string): string {
  const when = timeframe ? ` (${timeframe})` : "";
  return `[#${phaseName}](#doc:${waveDocId})${when} — diskusikan wave ini di sini.`;
}
