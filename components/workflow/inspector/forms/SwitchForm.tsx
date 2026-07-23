'use client';
import React from 'react';
import type { SwitchConfig } from '@/types/workflow-node';
import { InspectorTextInput, InspectorDropdown } from '../InspectorInputs';
import styles from '../InspectorInputs.module.css';

interface Props { config: SwitchConfig; onChange: (c: SwitchConfig) => void; errors: Record<string, string>; }

const OPERATORS = [
  { value: 'equals', label: 'equals' }, { value: 'notEquals', label: 'not equals' },
  { value: 'contains', label: 'contains' }, { value: 'greaterThan', label: 'greater than' },
  { value: 'lessThan', label: 'less than' }, { value: 'isEmpty', label: 'is empty' },
];

const FALLBACK_OPTIONS = [
  { value: 'none', label: 'Drop unmatched items' },
  { value: 'extra', label: 'Route to an extra fallback output' },
];

export default function SwitchForm({ config, onChange, errors }: Props) {
  const updateRule = (idx: number, field: 'outputKey' | 'field' | 'operator' | 'value', val: string) => {
    const next = [...config.rules];
    const rule = { ...next[idx] };
    if (field === 'outputKey') rule.outputKey = val;
    else rule.condition = { ...rule.condition, [field]: val };
    next[idx] = rule;
    onChange({ ...config, rules: next });
  };
  const removeRule = (idx: number) => onChange({ ...config, rules: config.rules.filter((_, i) => i !== idx) });
  const addRule = () => onChange({
    ...config,
    rules: [...config.rules, { outputKey: `Output ${config.rules.length}`, condition: { field: '', operator: 'equals', value: '' } }],
  });

  return (
    <>
      <div className={styles.field}>
        <label className={styles.label}>Rules (each routes to its own output)</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {config.rules.map((r, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 8, border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8 }}>
              <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}><InspectorTextInput label="Output name" value={r.outputKey} onChange={(v) => updateRule(i, 'outputKey', v)} placeholder={`Output ${i}`} /></div>
                <button type="button" className={styles.kvRemove} onClick={() => removeRule(i)} title="Remove rule" style={{ marginBottom: 0 }}>×</button>
              </div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end' }}>
                <div style={{ flex: 2 }}><InspectorTextInput label="Field" value={r.condition.field} onChange={(v) => updateRule(i, 'field', v)} placeholder="field_name" /></div>
                <div style={{ flex: 2 }}><InspectorDropdown label="Operator" value={r.condition.operator} options={OPERATORS} onChange={(v) => updateRule(i, 'operator', v)} /></div>
                <div style={{ flex: 2 }}><InspectorTextInput label="Value" value={r.condition.value} onChange={(v) => updateRule(i, 'value', v)} placeholder="value" /></div>
              </div>
            </div>
          ))}
          <button type="button" className={styles.kvAdd} onClick={addRule}>+ Add rule</button>
        </div>
        {errors.rules && <span className={styles.errorText}>{errors.rules}</span>}
      </div>
      <InspectorDropdown
        label="Unmatched items"
        value={config.fallbackOutput}
        options={FALLBACK_OPTIONS}
        onChange={(v) => onChange({ ...config, fallbackOutput: v as SwitchConfig['fallbackOutput'] })}
      />
    </>
  );
}
