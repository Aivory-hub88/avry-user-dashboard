'use client';

/**
 * useCanvasPersistence
 * Persists React Flow nodes + edges for non-n8n workflows.
 *
 * Strategy:
 *   - Primary store: backend API  (/api/workflows/[id]/canvas)
 *   - Secondary store: localStorage (instant read on same browser, fallback)
 *
 * Load order: API → localStorage → nothing
 * Save order: localStorage (immediate) + API (debounced 800ms)
 */

import { useCallback, useEffect, useRef } from 'react';
import type { Node, Edge } from '@xyflow/react';

const PREFIX = 'canvas_state_';

export interface CanvasState {
  nodes: Node[];
  edges: Edge[];
  savedAt: string;
}

// ── localStorage helpers ─────────────────────────────────

export function canvasStorageKey(workflowId: string) {
  return `${PREFIX}${workflowId}`;
}

/** Read from localStorage synchronously (used for instant hydration). */
export function loadCanvasState(workflowId: string): CanvasState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(canvasStorageKey(workflowId));
    if (!raw) return null;
    const state = JSON.parse(raw) as CanvasState;
    // Migrate legacy node types to canonical standardNode
    state.nodes = migrateNodes(state.nodes);
    return state;
  } catch {
    return null;
  }
}

/**
 * Migrate persisted nodes from legacy types to the canonical standardNode.
 * Old saves may have type: 'workflowStep', 'default', or missing icon/category.
 */
function migrateNodes(nodes: Node[]): Node[] {
  const CANONICAL_TYPES = new Set(['standardNode', 'appNode', 'triggerNode', 'agent']);
  return nodes.map((n) => {
    if (CANONICAL_TYPES.has(n.type ?? '')) return n;
    // Remap to standardNode with safe defaults
    return {
      ...n,
      type: 'standardNode' as const,
      data: {
        label: (n.data as any)?.label || (n.data as any)?.title || (n.data as any)?.action || 'Step',
        icon: (n.data as any)?.icon || 'http',
        category: (n.data as any)?.category || 'action',
        title: (n.data as any)?.title || (n.data as any)?.label || (n.data as any)?.action || 'Step',
        description: (n.data as any)?.description || (n.data as any)?.output || (n.data as any)?.subtitle || '',
        ...(n.data as any),
      },
    };
  });
}

function writeLocalStorage(workflowId: string, nodes: Node[], edges: Edge[]) {
  if (typeof window === 'undefined') return;
  try {
    const state: CanvasState = { nodes, edges, savedAt: new Date().toISOString() };
    localStorage.setItem(canvasStorageKey(workflowId), JSON.stringify(state));
  } catch { /* quota exceeded */ }
}

/** Remove from localStorage (e.g. on workflow delete). */
export function clearCanvasState(workflowId: string) {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(canvasStorageKey(workflowId));
  // Also clear from backend
  fetch(`/api/workflows/${workflowId}/canvas`, { method: 'DELETE' }).catch(() => {});
}

// ── Backend helpers ──────────────────────────────────────

/** Fetch canvas state from the backend. Returns null on any error. */
export async function fetchCanvasState(workflowId: string): Promise<CanvasState | null> {
  try {
    const res = await fetch(`/api/workflows/${workflowId}/canvas`);
    if (!res.ok) return null;
    const data = await res.json() as CanvasState | null;
    if (!data) return null;
    data.nodes = migrateNodes(data.nodes);
    return data;
  } catch {
    return null;
  }
}

/** Persist canvas state to the backend. Fire-and-forget. */
async function pushCanvasState(workflowId: string, nodes: Node[], edges: Edge[]) {
  try {
    await fetch(`/api/workflows/${workflowId}/canvas`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodes, edges }),
    });
  } catch { /* network error — localStorage already has the data */ }
}

// ── Auto-save hook ───────────────────────────────────────

/**
 * Auto-saves nodes+edges whenever they change.
 * Writes to localStorage immediately, then pushes to backend after debounce.
 * Only active when `enabled` is true (non-n8n workflows).
 */
export function useCanvasAutosave(
  workflowId: string,
  nodes: Node[],
  edges: Edge[],
  enabled: boolean,
  debounceMs = 800,
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    if (!enabledRef.current) return;

    // Write to localStorage immediately for instant same-browser reads
    writeLocalStorage(workflowId, nodes, edges);

    // Debounce the backend write
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      pushCanvasState(workflowId, nodes, edges);
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [workflowId, nodes, edges, enabled, debounceMs]);
}
