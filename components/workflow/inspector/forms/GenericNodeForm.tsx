'use client';
import React from 'react';
import type { GenericConfig } from '@/types/workflow-node';
import { InspectorTextInput, InspectorTextarea, KeyValueList } from '../InspectorInputs';

interface Props { config: GenericConfig; onChange: (c: GenericConfig) => void; errors: Record<string, string>; }

export default function GenericNodeForm({ config, onChange, errors }: Props) {
  const set = (p: Partial<GenericConfig>) => onChange({ ...config, ...p });
  return (
    <>
      <InspectorTextInput label="Name" value={config.name} onChange={(v) => set({ name: v })} placeholder="Step name" />
      <InspectorTextarea label="Description" value={config.description} onChange={(v) => set({ description: v })} placeholder="What this step does" rows={3} />
      <KeyValueList label="Parameters" items={config.fields} onChange={(fields) => set({ fields })} addLabel="+ Add parameter" />
    </>
  );
}
