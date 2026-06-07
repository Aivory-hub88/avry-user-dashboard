'use client';
import React from 'react';
import type { IfConditionConfig } from '@/types/workflow-node';
import { InspectorTextInput, InspectorDropdown } from '../InspectorInputs';
import styles from '../InspectorInputs.module.css';

interface Props { config: IfConditionConfig; onChange: (c: IfConditionConfig) => void; errors: Record<string, string>; }

const OPERATORS = [
  { value: 'equals', label: 'equals' }, { value: 'notEquals', label: 'not equals' },
  { value: 'contains', label: 'contains' }, { value: 'greaterThan', label: 'greater than' },
  { value: 'lessThan', label: 'less than' }, { value: 'isEmpty', label: 'is empty' },
];

export default function IfForm({ config, onChange, errors }: Props) {
  const updateCondition = (idx: number, field: string, val: string) => {
    const next = [...config.conditions];
    next[idx] = { ...next[idx], [field]: val };
    onChange({ ...config, conditions: next });
  };
  const removeCondition = (idx: number) => onChange({ ...config, conditions: config.conditions.filter((_, i) => i !== idx) });
  const addCondition = () => onChange({ ...config, conditions: [...config.conditions, { field: '', operator: 'equals', value: '' }] });

  return (
    <>
      <div className={styles.field}>
        <label className={styles.label}>Conditions</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {config.conditions.map((c, i) => (
            <div key={i} style={{ display: 'flex', gap: 4, alignItems: 'flex-end' }}>
              <div style={{ flex: 2 }}><InspectorTextInput label={i === 0 ? 'Field' : ''} value={c.field} onChange={(v) => updateCondition(i, 'field', v)} placeholder="field_name" /></div>
              <div style={{ flex: 2 }}><InspectorDropdown label={i === 0 ? 'Operator' : ''} value={c.operator} options={OPERATORS} onChange={(v) => updateCondition(i, 'operator', v)} /></div>
              <div style={{ flex: 2 }}><InspectorTextInput label={i === 0 ? 'Value' : ''} value={c.value} onChange={(v) => updateCondition(i, 'value', v)} placeholder="value" /></div>
              <button type="button" className={styles.kvRemove} onClick={() => removeCondition(i)} title="Remove" style={{ marginBottom: 0 }}>×</button>
            </div>
          ))}
          <button type="button" className={styles.kvAdd} onClick={addCondition}>+ Add condition</button>
        </div>
        {errors.conditions && <span className={styles.errorText}>{errors.conditions}</span>}
      </div>
      <div className={styles.toggleRow}>
        <span className={styles.label}>Combine with</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['AND', 'OR'] as const).map((op) => (
            <button key={op} type="button" onClick={() => onChange({ ...config, combinator: op })}
              style={{ padding: '4px 12px', borderRadius: 5, fontSize: 10, fontWeight: 600, cursor: 'pointer', border: '1px solid', fontFamily: 'inherit', transition: 'all 0.15s',
                background: config.combinator === op ? 'rgba(0,229,158,0.15)' : 'rgba(255,255,255,0.04)',
                borderColor: config.combinator === op ? 'rgba(0,229,158,0.3)' : 'rgba(255,255,255,0.08)',
                color: config.combinator === op ? '#00e59e' : '#a8a6a2',
              }}>{op}</button>
          ))}
        </div>
      </div>
    </>
  );
}
