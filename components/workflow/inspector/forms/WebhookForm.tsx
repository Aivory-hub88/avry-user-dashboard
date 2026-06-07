'use client';
import React from 'react';
import type { WebhookConfig } from '@/types/workflow-node';
import { InspectorDropdown, InspectorTextInput } from '../InspectorInputs';

interface Props { config: WebhookConfig; onChange: (c: WebhookConfig) => void; errors: Record<string, string>; }

export default function WebhookForm({ config, onChange, errors }: Props) {
  const set = (p: Partial<WebhookConfig>) => onChange({ ...config, ...p });
  return (
    <>
      <InspectorDropdown label="HTTP Method" value={config.httpMethod} options={[
        { value: 'GET', label: 'GET' }, { value: 'POST', label: 'POST' }, { value: 'ANY', label: 'Any' },
      ]} onChange={(v) => set({ httpMethod: v as WebhookConfig['httpMethod'] })} />
      <InspectorTextInput label="Path" value={config.path} onChange={(v) => set({ path: v })} placeholder="/webhook/my-hook" error={errors.path} />
      <InspectorDropdown label="Respond" value={config.respondWith} options={[
        { value: 'immediately', label: 'Immediately' },
        { value: 'lastNode', label: 'When last node finishes' },
        { value: 'respondToWebhookNode', label: 'Using Respond to Webhook node' },
      ]} onChange={(v) => set({ respondWith: v as WebhookConfig['respondWith'] })} />
    </>
  );
}
