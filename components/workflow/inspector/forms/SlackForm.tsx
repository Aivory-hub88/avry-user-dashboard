'use client';
import React from 'react';
import type { SlackConfig } from '@/types/workflow-node';
import { InspectorTextInput, InspectorTextarea, InspectorInfoBox } from '../InspectorInputs';

interface Props { config: SlackConfig; onChange: (c: SlackConfig) => void; errors: Record<string, string>; }

export default function SlackForm({ config, onChange, errors }: Props) {
  const set = (p: Partial<SlackConfig>) => onChange({ ...config, ...p });
  return (
    <>
      <InspectorTextInput label="Channel" value={config.channel} onChange={(v) => set({ channel: v })} error={errors.channel} placeholder="#general or channel ID" />
      <InspectorTextarea label="Message" value={config.text} onChange={(v) => set({ text: v })} placeholder="={{ $json.response }}" rows={3} />
      <InspectorTextInput label="Bot Token" value={config.botToken} onChange={(v) => set({ botToken: v })} placeholder="xoxb-..." type="text" />
      <InspectorInfoBox message="The bot token is used to create a Slack credential in your n8n instance when you deploy — Aivory does not store it. Leave blank to attach the credential yourself in n8n." />
    </>
  );
}
