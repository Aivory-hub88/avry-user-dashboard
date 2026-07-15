'use client';
import React from 'react';
import type { RssFeedConfig } from '@/types/workflow-node';
import { InspectorTextInput } from '../InspectorInputs';

interface Props { config: RssFeedConfig; onChange: (c: RssFeedConfig) => void; errors: Record<string, string>; }

export default function RssFeedForm({ config, onChange, errors }: Props) {
  const set = (p: Partial<RssFeedConfig>) => onChange({ ...config, ...p });
  return (
    <InspectorTextInput label="Feed URL" value={config.feedUrl} onChange={(v) => set({ feedUrl: v })} error={errors.feedUrl} placeholder="https://example.com/feed.xml" type="url" />
  );
}
