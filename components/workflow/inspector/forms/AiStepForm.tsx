'use client';
import React from 'react';
import type { AiStepConfig } from '@/types/workflow-node';
import { InspectorTextarea, InspectorSlider, InspectorTextInput, InspectorDropdown } from '../InspectorInputs';

interface Props { config: AiStepConfig; onChange: (c: AiStepConfig) => void; errors: Record<string, string>; }

const PROVIDER_OPTIONS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
];

const MODEL_OPTIONS_BY_PROVIDER: Record<AiStepConfig['provider'], { value: string; label: string }[]> = {
  openai: [
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o mini' },
    { value: 'gpt-4.1', label: 'GPT-4.1' },
    { value: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
    { value: 'o3-mini', label: 'o3-mini' },
  ],
  anthropic: [
    { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
    { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
    { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
  ],
};

export default function AiStepForm({ config, onChange, errors }: Props) {
  const set = (p: Partial<AiStepConfig>) => onChange({ ...config, ...p });
  const modelOptions = MODEL_OPTIONS_BY_PROVIDER[config.provider] ?? MODEL_OPTIONS_BY_PROVIDER.openai;
  const handleProviderChange = (v: string) => {
    const provider = v as AiStepConfig['provider'];
    set({ provider, model: MODEL_OPTIONS_BY_PROVIDER[provider][0].value });
  };
  return (
    <>
      <InspectorDropdown label="Provider" value={config.provider} options={PROVIDER_OPTIONS} onChange={handleProviderChange} />
      <InspectorDropdown label="Model" value={config.model} options={modelOptions} onChange={(v) => set({ model: v })} />
      <InspectorTextarea label="What happens" value={config.whatHappens} onChange={(v) => set({ whatHappens: v })} placeholder="Describe what this AI step does" rows={3} error={errors.whatHappens} />
      <InspectorTextarea label="System Prompt" value={config.systemPrompt} onChange={(v) => set({ systemPrompt: v })} placeholder="You are a helpful assistant..." rows={4} />
      <InspectorSlider label="Temperature" value={config.temperature} min={0} max={1} step={0.1} onChange={(v) => set({ temperature: v })} displayValue={config.temperature.toFixed(1)} />
      <InspectorTextInput label="Tool / Service" value={config.toolService} onChange={(v) => set({ toolService: v })} placeholder="e.g. Salesforce REST API" />
      <InspectorTextInput label="Expected Output" value={config.expectedOutput} onChange={(v) => set({ expectedOutput: v })} placeholder="What data this step returns" />
    </>
  );
}
