'use client';
import React from 'react';
import type { NodeErrorHandling } from '@/types/workflow-node';
import { InspectorToggle, InspectorDropdown, InspectorTextInput } from './InspectorInputs';

interface Props {
  value: NodeErrorHandling | undefined;
  onChange: (value: NodeErrorHandling) => void;
}

const ON_ERROR_OPTIONS = [
  { value: 'stopWorkflow', label: 'Stop the workflow' },
  { value: 'continueRegularOutput', label: 'Continue, using regular output' },
  { value: 'continueErrorOutput', label: 'Continue, using error output' },
];

/**
 * Retry/error-handling — rendered for ANY node type (not tied to one
 * NodeConfig variant). n8n keeps these as fields sibling to a node's
 * `parameters`, so they live on WorkflowNodeData.errorHandling, separate
 * from `data.config` (see lib/n8nMapper.ts's n8nToReactFlow/reactFlowToN8n,
 * which copy them as siblings in both directions).
 */
export default function ErrorHandlingSection({ value, onChange }: Props) {
  const eh = value ?? {};
  const retryOnFail = eh.retryOnFail ?? false;

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: '#a8a6a2', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Error handling
      </span>
      <InspectorToggle
        label="Retry on fail"
        checked={retryOnFail}
        onChange={(checked) => onChange({ ...eh, retryOnFail: checked, maxTries: eh.maxTries ?? 3, waitBetweenTries: eh.waitBetweenTries ?? 1000 })}
      />
      {retryOnFail && (
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <InspectorTextInput
              label="Max tries"
              type="number"
              value={String(eh.maxTries ?? 3)}
              onChange={(v) => onChange({ ...eh, maxTries: Math.max(1, parseInt(v, 10) || 1) })}
            />
          </div>
          <div style={{ flex: 1 }}>
            <InspectorTextInput
              label="Wait between tries (ms)"
              type="number"
              value={String(eh.waitBetweenTries ?? 1000)}
              onChange={(v) => onChange({ ...eh, waitBetweenTries: Math.max(0, parseInt(v, 10) || 0) })}
            />
          </div>
        </div>
      )}
      <InspectorDropdown
        label="On error"
        value={eh.onError ?? 'stopWorkflow'}
        options={ON_ERROR_OPTIONS}
        onChange={(v) => onChange({ ...eh, onError: v as NodeErrorHandling['onError'] })}
      />
    </div>
  );
}
