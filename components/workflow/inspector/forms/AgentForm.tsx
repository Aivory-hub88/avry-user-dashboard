'use client';

import React from 'react';
import type { AgentConfig } from '@/types/workflow-node';
import { InspectorTextInput, InspectorTextarea } from '../InspectorInputs';

interface Props {
  config: AgentConfig;
  onChange: (c: AgentConfig) => void;
  errors: Record<string, string>;
}

/**
 * AgentForm Component
 * 
 * Provides form fields for configuring an AI agent node:
 * - Agent name
 * - Model (e.g., "Claude 3.5")
 * - Provider (e.g., "OpenRouter")
 * - Runtime (e.g., "Zeroclaw")
 * - Prompt summary (textarea)
 * - Input variables (comma-separated)
 * - Output variable
 */
export default function AgentForm({ config, onChange, errors }: Props) {
  const set = (partial: Partial<AgentConfig>) => onChange({ ...config, ...partial });

  const handleInputVariablesChange = (value: string) => {
    const variables = value
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
    set({ inputVariables: variables });
  };

  const inputVariablesString = config.inputVariables.join(', ');

  return (
    <>
      <InspectorTextInput
        label="Agent Name"
        value={config.agentName}
        onChange={(v) => set({ agentName: v })}
        error={errors.agentName}
        placeholder="e.g., Research Agent"
      />
      <InspectorTextInput
        label="Model"
        value={config.model}
        onChange={(v) => set({ model: v })}
        error={errors.model}
        placeholder="e.g., Claude 3.5, GPT-4"
      />
      <InspectorTextInput
        label="Provider"
        value={config.provider}
        onChange={(v) => set({ provider: v })}
        error={errors.provider}
        placeholder="e.g., OpenRouter, OpenAI"
      />
      <InspectorTextInput
        label="Runtime"
        value={config.runtime}
        onChange={(v) => set({ runtime: v })}
        error={errors.runtime}
        placeholder="e.g., Zeroclaw, Local"
      />
      <InspectorTextarea
        label="Prompt Summary"
        value={config.promptSummary}
        onChange={(v) => set({ promptSummary: v })}
        error={errors.promptSummary}
        placeholder="Describe what this agent does..."
        rows={4}
      />
      <InspectorTextInput
        label="Input Variables"
        value={inputVariablesString}
        onChange={handleInputVariablesChange}
        error={errors.inputVariables}
        placeholder="e.g., user_input, context (comma-separated)"
      />
      <InspectorTextInput
        label="Output Variable"
        value={config.outputVariable}
        onChange={(v) => set({ outputVariable: v })}
        error={errors.outputVariable}
        placeholder="e.g., agent_result"
      />
    </>
  );
}
