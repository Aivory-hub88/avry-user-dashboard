'use client';
import React from 'react';
import type { GmailConfig } from '@/types/workflow-node';
import { InspectorTextInput, InspectorTextarea, InspectorInfoBox } from '../InspectorInputs';

interface Props { config: GmailConfig; onChange: (c: GmailConfig) => void; errors: Record<string, string>; }

export default function GmailForm({ config, onChange, errors }: Props) {
  const set = (p: Partial<GmailConfig>) => onChange({ ...config, ...p });
  return (
    <>
      <InspectorTextInput label="To" value={config.to} onChange={(v) => set({ to: v })} error={errors.to} placeholder="recipient@example.com" />
      <InspectorTextInput label="Subject" value={config.subject} onChange={(v) => set({ subject: v })} placeholder="Email subject" />
      <InspectorTextarea label="Message" value={config.message} onChange={(v) => set({ message: v })} placeholder="Email body" rows={4} />
      <InspectorInfoBox message="Gmail needs Google OAuth — attach your Gmail credential in n8n's node panel after deploying, Aivory can't complete that sign-in for you." />
    </>
  );
}
