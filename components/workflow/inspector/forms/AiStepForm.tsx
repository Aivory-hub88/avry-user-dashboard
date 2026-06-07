'use client';
import React from 'react';
import type { AiStepConfig } from '@/types/workflow-node';
import { InspectorTextarea, InspectorSlider, InspectorTextInput } from '../InspectorInputs';

interface Props { config: AiStepConfig; onChange: (c: AiStepConfig) => void; errors: Record<string, string>; }

export default function AiStepForm({ config, onChange, errors }: Props) {
  const set = (p: Partial<AiStepConfig>) => onChange({ ...config, ...p });
  return (
    <>
      <InspectorTextarea label="What happens" value={config.whatHappens} onChange={(v) => set({ whatHappens: v })} placeholder="Describe what this AI step does" rows={3} error={errors.whatHappens} />
      <InspectorTextarea label="System Prompt" value={config.systemPrompt} onChange={(v) => set({ systemPrompt: v })} placeholder="You are a helpful assistant..." rows={4} />
      <InspectorSlider label="Temperature" value={config.temperature} min={0} max={1} step={0.1} onChange={(v) => set({ temperature: v })} displayValue={config.temperature.toFixed(1)} />
      <InspectorTextInput label="Tool / Service" value={config.toolService} onChange={(v) => set({ toolService: v })} placeholder="e.g. Salesforce REST API" />
      <InspectorTextInput label="Expected Output" value={config.expectedOutput} onChange={(v) => set({ expectedOutput: v })} placeholder="What data this step returns" />
    </>
  );
}
