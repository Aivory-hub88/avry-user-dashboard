'use client';
import React from 'react';
import type { HttpRequestConfig } from '@/types/workflow-node';
import { InspectorDropdown, InspectorTextInput, InspectorToggle, KeyValueList, InspectorTextarea } from '../InspectorInputs';

interface Props { config: HttpRequestConfig; onChange: (c: HttpRequestConfig) => void; errors: Record<string, string>; }

export default function HttpRequestForm({ config, onChange, errors }: Props) {
  const set = (partial: Partial<HttpRequestConfig>) => onChange({ ...config, ...partial });
  return (
    <>
      <InspectorDropdown label="Method" value={config.method} options={[
        { value: 'GET', label: 'GET' }, { value: 'POST', label: 'POST' }, { value: 'PUT', label: 'PUT' },
        { value: 'PATCH', label: 'PATCH' }, { value: 'DELETE', label: 'DELETE' },
      ]} onChange={(v) => set({ method: v as HttpRequestConfig['method'] })} error={errors.method} />
      <InspectorTextInput label="URL" value={config.url} onChange={(v) => set({ url: v })} error={errors.url} placeholder="https://api.example.com/endpoint" type="url" />
      <InspectorDropdown label="Authentication" value={config.authentication} options={[
        { value: 'none', label: 'None' }, { value: 'apiKey', label: 'API Key' },
        { value: 'bearerToken', label: 'Bearer Token' }, { value: 'basicAuth', label: 'Basic Auth' },
      ]} onChange={(v) => set({ authentication: v as HttpRequestConfig['authentication'], authFields: {} })} />
      {config.authentication === 'apiKey' && (
        <>
          <InspectorTextInput label="Key Name" value={config.authFields?.keyName ?? ''} onChange={(v) => set({ authFields: { ...config.authFields, keyName: v } })} placeholder="X-API-Key" />
          <InspectorTextInput label="Key Value" value={config.authFields?.keyValue ?? ''} onChange={(v) => set({ authFields: { ...config.authFields, keyValue: v } })} placeholder="your-api-key" />
        </>
      )}
      {config.authentication === 'bearerToken' && (
        <InspectorTextInput label="Token" value={config.authFields?.token ?? ''} onChange={(v) => set({ authFields: { token: v } })} placeholder="Bearer token" />
      )}
      {config.authentication === 'basicAuth' && (
        <>
          <InspectorTextInput label="Username" value={config.authFields?.username ?? ''} onChange={(v) => set({ authFields: { ...config.authFields, username: v } })} />
          <InspectorTextInput label="Password" value={config.authFields?.password ?? ''} onChange={(v) => set({ authFields: { ...config.authFields, password: v } })} />
        </>
      )}
      <InspectorToggle label="Send Headers" checked={config.sendHeaders} onChange={(v) => set({ sendHeaders: v })} />
      {config.sendHeaders && <KeyValueList label="Headers" items={config.headers} onChange={(items) => set({ headers: items })} addLabel="+ Add Header" />}
      <InspectorToggle label="Send Query Params" checked={config.sendQuery} onChange={(v) => set({ sendQuery: v })} />
      {config.sendQuery && <KeyValueList label="Query Parameters" items={config.queryParams} onChange={(items) => set({ queryParams: items })} addLabel="+ Add Param" />}
      <InspectorToggle label="Send Body" checked={config.sendBody} onChange={(v) => set({ sendBody: v })} />
      {config.sendBody && (
        <>
          <InspectorDropdown label="Body Type" value={config.bodyType} options={[
            { value: 'json', label: 'JSON' }, { value: 'form', label: 'Form Data' }, { value: 'raw', label: 'Raw' },
          ]} onChange={(v) => set({ bodyType: v as HttpRequestConfig['bodyType'] })} />
          {config.bodyType === 'form' ? (
            <KeyValueList label="Form Fields" items={config.headers} onChange={(items) => set({ headers: items })} addLabel="+ Add Field" />
          ) : (
            <InspectorTextarea label="Body" value={config.body} onChange={(v) => set({ body: v })} placeholder='{"key": "value"}' rows={4} />
          )}
        </>
      )}
    </>
  );
}
