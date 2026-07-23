'use client';
import React from 'react';
import type { CodeConfig } from '@/types/workflow-node';
import { InspectorDropdown, InspectorTextarea } from '../InspectorInputs';

interface Props { config: CodeConfig; onChange: (c: CodeConfig) => void; errors: Record<string, string>; }

const LANGUAGES = [
  { value: 'javaScript', label: 'JavaScript' },
  { value: 'python', label: 'Python (self-hosted n8n only)' },
];

const MODES = [
  { value: 'runOnceForAllItems', label: 'Run once for all items' },
  { value: 'runOnceForEachItem', label: 'Run once per item' },
];

export default function CodeForm({ config, onChange, errors }: Props) {
  return (
    <>
      <InspectorDropdown label="Language" value={config.language} options={LANGUAGES}
        onChange={(v) => onChange({ ...config, language: v as CodeConfig['language'] })} />
      <InspectorDropdown label="Mode" value={config.mode} options={MODES}
        onChange={(v) => onChange({ ...config, mode: v as CodeConfig['mode'] })} />
      <InspectorTextarea label="Code" value={config.code} onChange={(v) => onChange({ ...config, code: v })}
        placeholder={config.mode === 'runOnceForAllItems' ? 'return items;' : 'return item;'}
        error={errors.code} rows={10} />
    </>
  );
}
