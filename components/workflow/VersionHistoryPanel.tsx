'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { asset } from '@/lib/asset';
import styles from './VersionHistoryPanel.module.css';

export interface VersionHistoryEntry {
  id: number;
  workflowId: string;
  version: number;
  triggerReason: string;
  createdAt: string;
}

export interface VersionHistoryPanelProps {
  open: boolean;
  workflowId: string;
  onClose: () => void;
  /** Called after a restore succeeds — caller should reload the workflow/canvas. */
  onRestored: () => void;
}

const REASON_LABELS: Record<string, string> = {
  ai_apply: 'AI edit applied',
  manual_edit: 'Manual step edit',
  status_change: 'Status changed',
  title_change: 'Renamed',
  restore: 'Restored from an earlier version',
};

export function VersionHistoryPanel({ open, workflowId, onClose, onRestored }: VersionHistoryPanelProps) {
  const [versions, setVersions] = useState<VersionHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoringVersion, setRestoringVersion] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(asset(`/api/workflows/${workflowId}/versions`));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setVersions(await res.json());
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load version history');
    } finally {
      setLoading(false);
    }
  }, [workflowId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const handleRestore = async (version: number) => {
    setRestoringVersion(version);
    try {
      const res = await fetch(asset(`/api/workflows/${workflowId}/versions/${version}/restore`), { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onRestored();
      onClose();
    } catch (err: any) {
      setError(err?.message ?? 'Restore failed');
    } finally {
      setRestoringVersion(null);
    }
  };

  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Version history</h2>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        {loading && <p className={styles.hint}>Loading…</p>}
        {error && <p className={styles.error}>{error}</p>}
        {!loading && !error && versions.length === 0 && (
          <p className={styles.hint}>No versions yet — one is captured automatically each time the Copilot applies changes, or you edit a step, title, or status.</p>
        )}

        <div className={styles.list}>
          {versions.map((v) => (
            <div key={v.id} className={styles.row}>
              <div className={styles.rowInfo}>
                <span className={styles.rowVersion}>v{v.version}</span>
                <span className={styles.rowReason}>{REASON_LABELS[v.triggerReason] ?? v.triggerReason}</span>
                <span className={styles.rowDate}>{new Date(v.createdAt).toLocaleString()}</span>
              </div>
              <button
                type="button"
                className={styles.restoreBtn}
                onClick={() => handleRestore(v.version)}
                disabled={restoringVersion !== null}
              >
                {restoringVersion === v.version ? 'Restoring…' : 'Restore'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default VersionHistoryPanel;
