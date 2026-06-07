'use client';

import React, { memo } from 'react';
import styles from './InspectorInputs.module.css';

// ── Dropdown ──
interface DropdownProps {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
}

export const InspectorDropdown = memo(({ label, value, options, onChange, error, placeholder }: DropdownProps) => (
  <div className={styles.field}>
    <label className={styles.label}>{label}</label>
    <select className={`${styles.select} ${error ? styles.errorBorder : ''}`} value={value} onChange={(e) => onChange(e.target.value)}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
    {error && <span className={styles.errorText}>{error}</span>}
  </div>
));
InspectorDropdown.displayName = 'InspectorDropdown';

// ── Text Input ──
interface TextInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
  type?: 'text' | 'number' | 'url';
}

export const InspectorTextInput = memo(({ label, value, onChange, error, placeholder, type = 'text' }: TextInputProps) => (
  <div className={styles.field}>
    <label className={styles.label}>{label}</label>
    <input className={`${styles.input} ${error ? styles.errorBorder : ''}`} type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    {error && <span className={styles.errorText}>{error}</span>}
  </div>
));
InspectorTextInput.displayName = 'InspectorTextInput';


// ── Textarea ──
interface TextareaProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
  rows?: number;
}

export const InspectorTextarea = memo(({ label, value, onChange, error, placeholder, rows = 3 }: TextareaProps) => (
  <div className={styles.field}>
    <label className={styles.label}>{label}</label>
    <textarea className={`${styles.textarea} ${error ? styles.errorBorder : ''}`} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows} />
    {error && <span className={styles.errorText}>{error}</span>}
  </div>
));
InspectorTextarea.displayName = 'InspectorTextarea';

// ── Toggle ──
interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: string;
}

export const InspectorToggle = memo(({ label, checked, onChange, description }: ToggleProps) => (
  <div className={styles.toggleRow}>
    <div className={styles.toggleInfo}>
      <span className={styles.label}>{label}</span>
      {description && <span className={styles.toggleDesc}>{description}</span>}
    </div>
    <button type="button" className={`${styles.toggle} ${checked ? styles.toggleOn : ''}`} onClick={() => onChange(!checked)} role="switch" aria-checked={checked}>
      <span className={styles.toggleThumb} />
    </button>
  </div>
));
InspectorToggle.displayName = 'InspectorToggle';

// ── Slider ──
interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  displayValue?: string;
}

export const InspectorSlider = memo(({ label, value, min, max, step, onChange, displayValue }: SliderProps) => (
  <div className={styles.field}>
    <div className={styles.sliderHeader}>
      <label className={styles.label}>{label}</label>
      <span className={styles.sliderValue}>{displayValue ?? value}</span>
    </div>
    <input type="range" className={styles.slider} min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
  </div>
));
InspectorSlider.displayName = 'InspectorSlider';

// ── Key-Value List ──
interface KeyValueListProps {
  label: string;
  items: { key: string; value: string }[];
  onChange: (items: { key: string; value: string }[]) => void;
  addLabel?: string;
}

export const KeyValueList = memo(({ label, items, onChange, addLabel = '+ Add' }: KeyValueListProps) => {
  const update = (idx: number, field: 'key' | 'value', val: string) => {
    const next = [...items];
    next[idx] = { ...next[idx], [field]: val };
    onChange(next);
  };
  const remove = (idx: number) => onChange(items.filter((_, i) => i !== idx));
  const add = () => onChange([...items, { key: '', value: '' }]);

  return (
    <div className={styles.field}>
      <label className={styles.label}>{label}</label>
      <div className={styles.kvList}>
        {items.map((item, i) => (
          <div key={i} className={styles.kvRow}>
            <input className={styles.kvInput} value={item.key} onChange={(e) => update(i, 'key', e.target.value)} placeholder="Key" />
            <input className={styles.kvInput} value={item.value} onChange={(e) => update(i, 'value', e.target.value)} placeholder="Value" />
            <button type="button" className={styles.kvRemove} onClick={() => remove(i)} title="Remove">×</button>
          </div>
        ))}
        <button type="button" className={styles.kvAdd} onClick={add}>{addLabel}</button>
      </div>
    </div>
  );
});
KeyValueList.displayName = 'KeyValueList';

// ── Info Box ──
interface InfoBoxProps {
  message: string;
  variant?: 'info' | 'warning';
}

export const InspectorInfoBox = memo(({ message, variant = 'info' }: InfoBoxProps) => (
  <div className={`${styles.infoBox} ${variant === 'warning' ? styles.infoBoxWarning : ''}`}>
    <span className={styles.infoIcon}>{variant === 'warning' ? '!' : 'i'}</span>
    <span>{message}</span>
  </div>
));
InspectorInfoBox.displayName = 'InspectorInfoBox';
