'use client';
import React from 'react';
import type { ScheduleConfig } from '@/types/workflow-node';
import { InspectorTextInput, InspectorDropdown } from '../InspectorInputs';

interface Props { config: ScheduleConfig; onChange: (c: ScheduleConfig) => void; errors: Record<string, string>; }

const TIMEZONES = ['UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin', 'Europe/Paris', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Jakarta', 'Australia/Sydney'];

export default function ScheduleForm({ config, onChange, errors }: Props) {
  const set = (p: Partial<ScheduleConfig>) => onChange({ ...config, ...p });
  return (
    <>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <InspectorTextInput label="Run every" value={String(config.interval)} onChange={(v) => set({ interval: parseInt(v) || 1 })} type="number" error={errors.interval} />
        </div>
        <div style={{ flex: 1 }}>
          <InspectorDropdown label="Unit" value={config.unit} options={[
            { value: 'minutes', label: 'Minutes' }, { value: 'hours', label: 'Hours' },
            { value: 'days', label: 'Days' }, { value: 'weeks', label: 'Weeks' },
          ]} onChange={(v) => set({ unit: v as ScheduleConfig['unit'] })} />
        </div>
      </div>
      <InspectorTextInput label="Start time (optional)" value={config.startTime ?? ''} onChange={(v) => set({ startTime: v || undefined })} placeholder="HH:MM" />
      <InspectorDropdown label="Timezone" value={config.timezone} options={TIMEZONES.map((tz) => ({ value: tz, label: tz }))} onChange={(v) => set({ timezone: v })} />
    </>
  );
}
