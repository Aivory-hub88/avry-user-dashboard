'use client';
import React from 'react';
import type { HttpResponseConfig } from '@/types/workflow-node';
import { InspectorDropdown, InspectorTextarea } from '../InspectorInputs';

interface Props { config: HttpResponseConfig; onChange: (c: HttpResponseConfig) => void; errors: Record<string, string>; }

export default function HttpResponseForm({ config, onChange, errors }: Props) {
  const set = (p: Partial<HttpResponseConfig>) => onChange({ ...config, ...p });
  return (
    <>
      <InspectorDropdown label="Status Code" value={String(config.statusCode)} options={[
        { value: '200', label: '200 OK' }, { value: '201', label: '201 Created' },
        { value: '400', label: '400 Bad Request' }, { value: '401', label: '401 Unauthorized' },
        { value: '404', label: '404 Not Found' }, { value: '500', label: '500 Server Error' },
      ]} onChange={(v) => set({ statusCode: parseInt(v) })} />
      <InspectorTextarea label="Response Body" value={config.responseBody} onChange={(v) => set({ responseBody: v })} placeholder='{"message": "Success"}' rows={5} />
    </>
  );
}
