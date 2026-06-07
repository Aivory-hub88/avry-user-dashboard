'use client';

import { useEffect } from 'react';

// Simple className merge helper (no external dependency)
function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export type SyncState =
  | 'synced'
  | 'unsaved'
  | 'saving'
  | 'save-success'
  | 'save-error';

type Props = {
  state: SyncState;
  errorMessage?: string | null;
  onRetry?: () => void;
};

export function SyncStatus({ state, errorMessage, onRetry }: Props) {
  useEffect(() => {
    if (state === 'save-success') {
      const timeout = setTimeout(() => {
        // Parent component can set state back to "synced" after this flash
      }, 1000);
      return () => clearTimeout(timeout);
    }
  }, [state]);

  if (state === 'saving') {
    return (
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <span className="animate-pulse">⏳</span>
        <span>Saving...</span>
      </div>
    );
  }

  if (state === 'save-error') {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="flex items-center gap-1 text-xs text-red-500 hover:underline"
      >
        <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
        <span>Sync failed — retry</span>
        {errorMessage && (
          <span className="max-w-[220px] truncate text-[10px] opacity-80">
            ({errorMessage})
          </span>
        )}
      </button>
    );
  }

  const isFlash = state === 'save-success';
  return (
    <div
      className={cn(
        'flex items-center gap-1 text-xs',
        isFlash
          ? 'text-emerald-500 animate-pulse'
          : state === 'unsaved'
            ? 'text-amber-500'
            : 'text-emerald-500',
      )}
    >
      <span
        className={cn(
          'inline-block h-2 w-2 rounded-full',
          state === 'unsaved' ? 'bg-amber-500' : 'bg-emerald-500',
        )}
      />
      <span>{state === 'unsaved' ? 'Unsaved changes' : 'Synced'}</span>
    </div>
  );
}
