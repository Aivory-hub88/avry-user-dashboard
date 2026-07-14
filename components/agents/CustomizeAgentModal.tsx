'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AgentProfile,
  getAgentProfile,
  resetAgentProfile,
  saveAgentProfile,
} from '@/lib/agentProfiles';

/**
 * Per-agent identity editor. What the operator saves here is injected into
 * the agent's system prompt as data (never as instructions), so the same
 * prebuilt agent can serve every business under its own name, tone, and FAQ.
 */

const FIELD_LIMITS = {
  agent_name: 80,
  business_name: 120,
  tone: 200,
  language_pref: 200,
  business_description: 1500,
  knowledge: 4000,
  custom_instructions: 1500,
  greeting: 300,
} as const;

type Option = { value: string; label: string };

// Stored in language_pref as a comma-separated string, e.g. "Indonesian, English"
const LANGUAGES: Option[] = [
  { value: 'English', label: 'English' },
  { value: 'Indonesian', label: 'Indonesian' },
  { value: 'Arabic', label: 'Arabic' },
  { value: 'Mandarin', label: 'Mandarin' },
  { value: 'Japanese', label: 'Japanese' },
  { value: 'Korean', label: 'Korean' },
  { value: 'French', label: 'French' },
  { value: 'German', label: 'German / Deutsch' },
  { value: 'Spanish', label: 'Spanish' },
  { value: 'Portuguese', label: 'Portuguese' },
  { value: 'Italian', label: 'Italian' },
];

// Stored in tone as a comma-separated string; values read naturally in the
// agent's prompt ("Tone of voice: Friendly, Direct & concise").
const TONES: Option[] = [
  { value: 'Friendly', label: 'Friendly' },
  { value: 'Professional', label: 'Professional' },
  { value: 'Casual', label: 'Casual' },
  { value: 'Formal', label: 'Formal' },
  { value: 'Warm', label: 'Warm' },
  { value: 'Empathetic', label: 'Empathetic' },
  { value: 'Playful', label: 'Playful' },
  { value: 'Direct & concise', label: 'Direct & concise' },
  { value: 'Enthusiastic', label: 'Enthusiastic' },
  { value: 'Calm & patient', label: 'Calm & patient' },
  { value: 'Persuasive', label: 'Persuasive' },
  { value: 'Premium & polished', label: 'Premium & polished' },
];

function parseSelection(saved: string, options: Option[]): string[] {
  const known = new Map(options.map((o) => [o.value.toLowerCase(), o.value]));
  return saved
    .split(',')
    .map((s) => known.get(s.trim().toLowerCase()))
    .filter((v): v is string => !!v);
}

type FieldKey = keyof typeof FIELD_LIMITS;

const EMPTY: Record<FieldKey, string> = {
  agent_name: '',
  business_name: '',
  tone: '',
  language_pref: '',
  business_description: '',
  knowledge: '',
  custom_instructions: '',
  greeting: '',
};

const inputClass =
  'w-full px-3.5 py-2.5 rounded-lg bg-white/[0.04] border border-white/10 text-white/90 text-[13px] placeholder-white/25 focus:outline-none focus:border-[#b7cba6]/40 transition-colors';

function Field({
  label, hint, value, limit, onChange, textarea, rows, placeholder,
}: {
  label: string;
  hint?: string;
  value: string;
  limit: number;
  onChange: (v: string) => void;
  textarea?: boolean;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <label className="text-white/70 text-[12px] font-medium">{label}</label>
        <span className={`text-[10px] ${value.length > limit * 0.9 ? 'text-[#e8b96a]/80' : 'text-white/25'}`}>
          {value.length}/{limit}
        </span>
      </div>
      {hint && <div className="text-white/35 text-[11px] mb-1.5 -mt-0.5">{hint}</div>}
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, limit))}
          rows={rows || 3}
          placeholder={placeholder}
          className={`${inputClass} resize-y min-h-[64px]`}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, limit))}
          placeholder={placeholder}
          className={inputClass}
        />
      )}
    </div>
  );
}

function MultiSelect({
  label, placeholder, options, selected, onChange, max,
}: {
  label: string;
  placeholder: string;
  options: Option[];
  selected: string[];
  onChange: (values: string[]) => void;
  max?: number;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const atMax = max !== undefined && selected.length >= max;

  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else if (!atMax) {
      onChange([...selected, value]);
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex items-baseline justify-between mb-1.5">
        <label className="text-white/70 text-[12px] font-medium">{label}</label>
        <span className={`text-[10px] ${atMax ? 'text-[#e8b96a]/80' : 'text-white/25'}`}>
          {selected.length > 0 ? `${selected.length}${max ? `/${max}` : ''} selected` : max ? `up to ${max}` : ''}
        </span>
      </div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`${inputClass} flex items-center justify-between gap-2 text-left cursor-pointer`}
      >
        {selected.length === 0 ? (
          <span className="text-white/25">{placeholder}</span>
        ) : (
          <span className="flex flex-wrap gap-1.5 min-w-0">
            {selected.map((v) => (
              <span
                key={v}
                className="inline-flex items-center gap-1 px-2 py-[2px] rounded-full bg-[#b7cba6]/15 border border-[#b7cba6]/25 text-[#dbe5d3] text-[11px]"
              >
                {v}
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); toggle(v); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); toggle(v); } }}
                  className="text-[#dbe5d3]/60 hover:text-white leading-none cursor-pointer"
                  aria-label={`Remove ${v}`}
                >
                  ×
                </span>
              </span>
            ))}
          </span>
        )}
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-3.5 h-3.5 shrink-0 text-white/40 transition-transform ${open ? 'rotate-180' : ''}`}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-20 mt-1.5 w-full max-h-52 overflow-y-auto rounded-lg bg-[#2e2e2e] border border-white/12 shadow-xl py-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          {options.map((option) => {
            const checked = selected.includes(option.value);
            const disabled = !checked && atMax;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => toggle(option.value)}
                disabled={disabled}
                className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-[13px] transition-colors ${disabled ? 'text-white/25 cursor-not-allowed' : 'text-white/80 hover:bg-white/[0.06]'}`}
              >
                <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${checked ? 'bg-[#b7cba6]/80 border-[#b7cba6]' : disabled ? 'border-white/10' : 'border-white/25'}`}>
                  {checked && (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="#242424" className="w-3 h-3">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  )}
                </span>
                {option.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function CustomizeAgentModal({
  isOpen, onClose, agentName, agentType,
}: {
  isOpen: boolean;
  onClose: () => void;
  agentName: string | null;
  agentType: string | null;
}) {
  const [fields, setFields] = useState<Record<FieldKey, string>>(EMPTY);
  const [hasProfile, setHasProfile] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!isOpen || !agentType) return;
    setLoading(true);
    setError(null);
    setSaved(false);
    getAgentProfile(agentType)
      .then((profile) => {
        const next = { ...EMPTY };
        if (profile) {
          for (const key of Object.keys(EMPTY) as FieldKey[]) {
            next[key] = (profile[key as keyof AgentProfile] as string) || '';
          }
        }
        setFields(next);
        setHasProfile(!!profile);
      })
      .catch(() => setError('Could not load the saved identity. You can still edit and save.'))
      .finally(() => setLoading(false));
  }, [isOpen, agentType]);

  if (!isOpen) return null;

  const set = (key: FieldKey) => (v: string) => {
    setFields((prev) => ({ ...prev, [key]: v }));
    setSaved(false);
  };

  const handleSave = async () => {
    if (!agentType || saving) return;
    setSaving(true);
    setError(null);
    try {
      const payload: AgentProfile = {};
      for (const key of Object.keys(EMPTY) as FieldKey[]) {
        payload[key as keyof AgentProfile] = fields[key].trim() || null;
      }
      await saveAgentProfile(agentType, payload);
      setHasProfile(true);
      setSaved(true);
    } catch {
      setError('Saving failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!agentType || saving) return;
    if (!window.confirm('Reset this agent to its default Aivory identity? Your saved customization will be removed.')) return;
    setSaving(true);
    setError(null);
    try {
      await resetAgentProfile(agentType);
      setFields({ ...EMPTY });
      setHasProfile(false);
      setSaved(true);
    } catch {
      setError('Reset failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-[#242424] border border-white/10 rounded-[24px] w-full max-w-lg shadow-2xl relative flex flex-col max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-8 pt-8 pb-4 shrink-0">
          <button onClick={onClose} className="absolute top-6 right-6 text-white/40 hover:text-white transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <h3 style={{ fontSize: 20, fontWeight: 300, color: '#fff', margin: '0 0 8px', lineHeight: 1.3 }}>
            Customize {agentName}
          </h3>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, margin: 0 }}>
            Give this agent your business identity. It will introduce itself with your name, follow your tone, and answer from your business knowledge — on every channel it is deployed to.
          </p>
        </div>

        <div className="px-8 overflow-y-auto flex-1 space-y-4 py-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          {loading ? (
            <div className="py-10 text-center text-white/40 text-[13px]">Loading saved identity…</div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Agent name" value={fields.agent_name} limit={FIELD_LIMITS.agent_name} onChange={set('agent_name')} placeholder="e.g. Sari" />
                <Field label="Business name" value={fields.business_name} limit={FIELD_LIMITS.business_name} onChange={set('business_name')} placeholder="e.g. Toko Baju Melati" />
              </div>
              <MultiSelect
                label="Tone of voice"
                placeholder="Default tone (warm & helpful)"
                options={TONES}
                max={3}
                selected={parseSelection(fields.tone, TONES)}
                onChange={(tones) => set('tone')(tones.join(', '))}
              />
              <MultiSelect
                label="Preferred languages"
                placeholder="Any language (auto-detect)"
                options={LANGUAGES}
                selected={parseSelection(fields.language_pref, LANGUAGES)}
                onChange={(langs) => set('language_pref')(langs.join(', '))}
              />
              <Field
                label="About the business"
                value={fields.business_description}
                limit={FIELD_LIMITS.business_description}
                onChange={set('business_description')}
                textarea
                placeholder="What you sell, who your customers are, what makes you different…"
              />
              <Field
                label="Business knowledge / FAQ"
                hint="Opening hours, shipping, returns, pricing, common questions — the agent answers from this first."
                value={fields.knowledge}
                limit={FIELD_LIMITS.knowledge}
                onChange={set('knowledge')}
                textarea
                rows={6}
                placeholder={'Q: What are your opening hours?\nA: 09.00–21.00 WIB, every day.'}
              />
              <Field
                label="Extra style notes"
                value={fields.custom_instructions}
                limit={FIELD_LIMITS.custom_instructions}
                onChange={set('custom_instructions')}
                textarea
                placeholder="e.g. Always mention the latest catalog at the end of a chat."
              />
              <Field
                label="Greeting"
                value={fields.greeting}
                limit={FIELD_LIMITS.greeting}
                onChange={set('greeting')}
                placeholder="First message shown when a customer connects (optional)"
              />
            </>
          )}
        </div>

        <div className="px-8 py-6 shrink-0 border-t border-white/[0.06]">
          {error && (
            <div className="mb-3 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300/90 text-[12px]">
              {error}
            </div>
          )}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving || loading}
              className="flex-1 py-2.5 rounded-lg bg-[#b7cba6]/20 hover:bg-[#b7cba6]/30 text-[#dbe5d3] text-[13px] font-medium transition-all border border-[#b7cba6]/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save identity'}
            </button>
            {hasProfile && (
              <button
                onClick={handleReset}
                disabled={saving || loading}
                className="px-4 py-2.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-white/60 hover:text-white/85 text-[13px] transition-all border border-white/10 disabled:opacity-50"
              >
                Reset to default
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
