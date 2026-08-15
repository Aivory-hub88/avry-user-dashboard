'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AgentProfile,
  getAgentProfile,
  resetAgentProfile,
  saveAgentProfile,
} from '@/lib/agentProfiles';
import { ToolScope, getToolScope, saveToolScope } from '@/lib/agentToolScope';
import { ConnectedApp, getConnectedApps } from '@/lib/integrationStatus';
import {
  TenantMcpServer,
  TenantMcpServerError,
  deleteTenantMcpServer,
  listTenantMcpServers,
  registerTenantMcpServer,
  reverifyTenantMcpServer,
} from '@/lib/tenantMcpServers';
import { asset } from '@/lib/asset';

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

// Display names for toggleable external toolkit slugs — must stay in sync
// with avry-backend's agent_tool_scope.py TOGGLEABLE_TOOLKITS.
const TOOLKIT_LABELS: Record<string, string> = {
  zendesk: 'Zendesk',
};

const CONNECTION_STATUS_STYLES: Record<ConnectedApp['status'], { label: string; className: string }> = {
  connected: { label: 'Connected', className: 'bg-[#b7cba6]/15 border-[#b7cba6]/25 text-[#dbe5d3]' },
  needs_reauth: { label: 'Needs reconnect', className: 'bg-[#e8b96a]/15 border-[#e8b96a]/25 text-[#e8b96a]' },
  revoked: { label: 'Revoked', className: 'bg-white/[0.06] border-white/10 text-white/40' },
};

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
  const [tab, setTab] = useState<'identity' | 'connections' | 'tools' | 'mcp'>('identity');
  const [fields, setFields] = useState<Record<FieldKey, string>>(EMPTY);
  const [hasProfile, setHasProfile] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [connections, setConnections] = useState<ConnectedApp[] | null>(null);
  const [connectionsFetched, setConnectionsFetched] = useState(false);
  const [connectionsLoading, setConnectionsLoading] = useState(false);
  const [connectionsError, setConnectionsError] = useState<string | null>(null);

  const [toolScope, setToolScope] = useState<ToolScope | null | undefined>(undefined); // undefined = not yet fetched, null = no toggleable toolkits
  const [toolsFetched, setToolsFetched] = useState(false);
  const [toolsLoading, setToolsLoading] = useState(false);
  const [toolsError, setToolsError] = useState<string | null>(null);
  const [savingToolkit, setSavingToolkit] = useState<string | null>(null);

  const [mcpServers, setMcpServers] = useState<TenantMcpServer[]>([]);
  const [mcpFetched, setMcpFetched] = useState(false);
  const [mcpLoading, setMcpLoading] = useState(false);
  const [mcpListError, setMcpListError] = useState<string | null>(null);
  const [mcpBusyId, setMcpBusyId] = useState<string | null>(null);
  const [mcpForm, setMcpForm] = useState({ name: '', url: '', transport: 'streamable-http' as 'streamable-http' | 'sse', authHeaderName: '', authHeaderValue: '' });
  const [mcpRegistering, setMcpRegistering] = useState(false);
  const [mcpFormError, setMcpFormError] = useState<string | null>(null);

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

  // Reset to the Identity tab and clear other tabs' state each time the
  // modal is (re)opened for a (possibly different) agent, and lazy-load
  // Connections/Tools data only the first time their tab is actually opened.
  useEffect(() => {
    if (!isOpen) return;
    setTab('identity');
    setConnections(null);
    setConnectionsFetched(false);
    setConnectionsError(null);
    setToolScope(undefined);
    setToolsFetched(false);
    setToolsError(null);
    setMcpServers([]);
    setMcpFetched(false);
    setMcpListError(null);
    setMcpForm({ name: '', url: '', transport: 'streamable-http', authHeaderName: '', authHeaderValue: '' });
    setMcpFormError(null);
  }, [isOpen, agentType]);

  // `connectionsFetched`/`toolsFetched` (not "is the data still null") gate
  // the retry — a failed fetch leaves `connections`/`toolScope` at their
  // empty sentinel forever, and gating on that alone would refetch on every
  // render once `*Loading` flips back to false, looping forever on a
  // genuine failure (e.g. a real 401) instead of settling into an error
  // state. Caught live: without this, a 401 here rendered as a "Loading…"
  // spinner that never resolved.
  useEffect(() => {
    if (!isOpen || tab !== 'connections' || connectionsFetched || connectionsLoading) return;
    setConnectionsLoading(true);
    setConnectionsError(null);
    getConnectedApps()
      .then(setConnections)
      .catch(() => setConnectionsError('Could not load your connections.'))
      .finally(() => {
        setConnectionsLoading(false);
        setConnectionsFetched(true);
      });
  }, [isOpen, tab, connectionsFetched, connectionsLoading]);

  useEffect(() => {
    if (!isOpen || !agentType || tab !== 'tools' || toolsFetched || toolsLoading) return;
    setToolsLoading(true);
    setToolsError(null);
    getToolScope(agentType)
      .then(setToolScope)
      .catch(() => setToolsError('Could not load tool settings.'))
      .finally(() => {
        setToolsLoading(false);
        setToolsFetched(true);
      });
  }, [isOpen, agentType, tab, toolsFetched, toolsLoading]);

  useEffect(() => {
    if (!isOpen || !agentType || tab !== 'mcp' || mcpFetched || mcpLoading) return;
    setMcpLoading(true);
    setMcpListError(null);
    listTenantMcpServers(agentType)
      .then(setMcpServers)
      .catch((e) => setMcpListError(e instanceof TenantMcpServerError ? e.message : 'Could not load custom MCP servers.'))
      .finally(() => {
        setMcpLoading(false);
        setMcpFetched(true);
      });
  }, [isOpen, agentType, tab, mcpFetched, mcpLoading]);

  if (!isOpen) return null;

  const toggleToolkit = async (slug: string, enabled: boolean) => {
    if (!agentType || !toolScope || savingToolkit) return;
    const previous = toolScope;
    setToolScope({ ...toolScope, tools: { ...toolScope.tools, [slug]: enabled } }); // optimistic
    setSavingToolkit(slug);
    setToolsError(null);
    try {
      await saveToolScope(agentType, { [slug]: enabled });
    } catch {
      setToolScope(previous); // revert on failure
      setToolsError(`Could not update ${TOOLKIT_LABELS[slug] || slug}. Please try again.`);
    } finally {
      setSavingToolkit(null);
    }
  };

  const handleRegisterMcpServer = async () => {
    if (!agentType || mcpRegistering) return;
    const name = mcpForm.name.trim();
    const url = mcpForm.url.trim();
    if (!name || !url) {
      setMcpFormError('Name and URL are required.');
      return;
    }
    setMcpRegistering(true);
    setMcpFormError(null);
    try {
      const result = await registerTenantMcpServer({
        agent_type: agentType,
        name,
        url,
        transport: mcpForm.transport,
        auth_header_name: mcpForm.authHeaderName.trim() || undefined,
        auth_header_value: mcpForm.authHeaderValue.trim() || undefined,
      });
      setMcpServers((prev) => [result, ...prev]);
      setMcpForm({ name: '', url: '', transport: 'streamable-http', authHeaderName: '', authHeaderValue: '' });
    } catch (e) {
      if (e instanceof TenantMcpServerError && e.server) {
        // Verification failed, but the row WAS persisted — show it in the
        // list (status: verification_failed) rather than just an error.
        setMcpServers((prev) => [e.server as TenantMcpServer, ...prev]);
        setMcpForm({ name: '', url: '', transport: 'streamable-http', authHeaderName: '', authHeaderValue: '' });
        setMcpFormError(`Saved, but verification failed: ${e.message}`);
      } else {
        setMcpFormError(e instanceof TenantMcpServerError ? e.message : 'Could not register the server.');
      }
    } finally {
      setMcpRegistering(false);
    }
  };

  const handleReverifyMcpServer = async (id: string) => {
    if (mcpBusyId) return;
    setMcpBusyId(id);
    setMcpListError(null);
    try {
      const result = await reverifyTenantMcpServer(id);
      setMcpServers((prev) => prev.map((s) => (s.id === id ? result : s)));
    } catch (e) {
      if (e instanceof TenantMcpServerError && e.server) {
        setMcpServers((prev) => prev.map((s) => (s.id === id ? (e.server as TenantMcpServer) : s)));
      } else {
        setMcpListError(e instanceof TenantMcpServerError ? e.message : 'Reverification failed.');
      }
    } finally {
      setMcpBusyId(null);
    }
  };

  const handleDeleteMcpServer = async (id: string, name: string) => {
    if (mcpBusyId) return;
    if (!window.confirm(`Remove custom MCP server "${name}"? This agent will lose access to its tools immediately.`)) return;
    setMcpBusyId(id);
    setMcpListError(null);
    try {
      await deleteTenantMcpServer(id);
      setMcpServers((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      setMcpListError(e instanceof TenantMcpServerError ? e.message : 'Could not remove the server.');
    } finally {
      setMcpBusyId(null);
    }
  };

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
    if (!window.confirm('Reset this agent to its default Aivory identity? Your saved customisation will be removed.')) return;
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
            Customise {agentName}
          </h3>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, margin: '0 0 16px' }}>
            {tab === 'identity' && 'Give this agent your business identity. It will introduce itself with your name, follow your tone, and answer from your business knowledge — on every channel it is deployed to.'}
            {tab === 'connections' && 'Third-party apps this agent can use, once connected on the Integrations page.'}
            {tab === 'tools' && 'Turn off any external toolkit you don’t want this agent to use. Aivory’s built-in tools always stay on.'}
            {tab === 'mcp' && 'Connect this agent to your own systems by registering an MCP server you control. Pro plan and above, Aivory Cerveau agents only — every tool call requires your approval.'}
          </p>
          <div className="flex items-center gap-1 border-b border-white/[0.06] -mb-4">
            {(['identity', 'connections', 'tools', 'mcp'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`px-3.5 py-2.5 text-[12.5px] font-medium transition-colors border-b-2 -mb-px ${
                  t === 'mcp' ? '' : 'capitalize'
                } ${
                  tab === t
                    ? 'text-[#dbe5d3] border-[#b7cba6]'
                    : 'text-white/40 hover:text-white/65 border-transparent'
                }`}
              >
                {t === 'mcp' ? 'MCP' : t}
              </button>
            ))}
          </div>
        </div>

        <div className="px-8 overflow-y-auto flex-1 space-y-4 py-5 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          {tab === 'identity' && (
            loading ? (
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
            )
          )}

          {tab === 'connections' && (
            connectionsLoading ? (
              <div className="py-10 text-center text-white/40 text-[13px]">Loading connections…</div>
            ) : connectionsError ? (
              <div className="px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300/90 text-[12px]">
                {connectionsError}
              </div>
            ) : !connections || connections.length === 0 ? (
              <div className="py-10 text-center text-white/40 text-[13px]">
                No third-party apps connected yet.
              </div>
            ) : (
              <div className="space-y-2">
                {connections.map((c) => {
                  const style = CONNECTION_STATUS_STYLES[c.status];
                  return (
                    <div
                      key={c.id}
                      className="flex items-center justify-between px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06]"
                    >
                      <span className="text-white/80 text-[13px]">{c.displayName || c.appName}</span>
                      <span className={`px-2.5 py-1 rounded-full border text-[11px] font-medium ${style.className}`}>
                        {style.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )
          )}
          {tab === 'connections' && (
            <a
              href={asset('/integrations')}
              className="block text-center text-[#dbe5d3]/80 hover:text-[#dbe5d3] text-[12.5px] mt-2"
            >
              Manage connections on the Integrations page →
            </a>
          )}

          {tab === 'tools' && (
            toolsLoading ? (
              <div className="py-10 text-center text-white/40 text-[13px]">Loading tool settings…</div>
            ) : toolScope === null ? (
              <div className="py-10 text-center text-white/40 text-[13px]">
                This agent has no external toolkits to configure yet — it always has access to Aivory’s built-in tools.
              </div>
            ) : !toolScope ? (
              <div className="py-10 text-center text-white/40 text-[13px]">Could not load tool settings.</div>
            ) : (
              <div className="space-y-2">
                {toolsError && (
                  <div className="mb-2 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300/90 text-[12px]">
                    {toolsError}
                  </div>
                )}
                {Object.entries(toolScope.tools).map(([slug, enabled]) => (
                  <div
                    key={slug}
                    className="flex items-center justify-between px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06]"
                  >
                    <span className="text-white/80 text-[13px]">{TOOLKIT_LABELS[slug] || slug}</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={enabled}
                      disabled={savingToolkit === slug}
                      onClick={() => toggleToolkit(slug, !enabled)}
                      className={`relative w-10 h-[22px] rounded-full transition-colors disabled:opacity-50 ${
                        enabled ? 'bg-[#b7cba6]/70' : 'bg-white/10'
                      }`}
                    >
                      <span
                        className={`absolute top-[3px] w-4 h-4 rounded-full bg-white transition-transform ${
                          enabled ? 'translate-x-[21px]' : 'translate-x-[3px]'
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>
            )
          )}

          {tab === 'mcp' && (
            mcpLoading ? (
              <div className="py-10 text-center text-white/40 text-[13px]">Loading custom MCP servers…</div>
            ) : (
              <div className="space-y-4">
                {mcpListError && (
                  <div className="px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300/90 text-[12px]">
                    {mcpListError}
                  </div>
                )}

                {mcpServers.length > 0 && (
                  <div className="space-y-2">
                    {mcpServers.map((s) => {
                      const style =
                        s.status === 'verified'
                          ? { label: `Verified${s.tool_count != null ? ` · ${s.tool_count} tool${s.tool_count === 1 ? '' : 's'}` : ''}`, className: 'bg-[#b7cba6]/15 border-[#b7cba6]/25 text-[#dbe5d3]' }
                          : s.status === 'verification_failed'
                            ? { label: 'Verification failed', className: 'bg-red-500/10 border-red-500/20 text-red-300/90' }
                            : { label: 'Verifying…', className: 'bg-[#e8b96a]/15 border-[#e8b96a]/25 text-[#e8b96a]' };
                      return (
                        <div key={s.id} className="px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-white/80 text-[13px] font-medium truncate">{s.name}</div>
                              <div className="text-white/35 text-[11px] truncate">{s.url}</div>
                            </div>
                            <span className={`shrink-0 px-2.5 py-1 rounded-full border text-[11px] font-medium ${style.className}`}>
                              {style.label}
                            </span>
                          </div>
                          {s.status === 'verification_failed' && s.last_verify_error && (
                            <div className="mt-2 text-red-300/70 text-[11.5px]">{s.last_verify_error}</div>
                          )}
                          <div className="mt-2.5 flex items-center gap-3">
                            <button
                              type="button"
                              disabled={mcpBusyId === s.id}
                              onClick={() => handleReverifyMcpServer(s.id)}
                              className="text-[#dbe5d3]/70 hover:text-[#dbe5d3] text-[11.5px] disabled:opacity-40"
                            >
                              {mcpBusyId === s.id ? 'Working…' : 'Reverify'}
                            </button>
                            <button
                              type="button"
                              disabled={mcpBusyId === s.id}
                              onClick={() => handleDeleteMcpServer(s.id, s.name)}
                              className="text-red-300/60 hover:text-red-300/90 text-[11.5px] disabled:opacity-40"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {mcpServers.length === 0 && (
                  <>
                    {mcpFormError && (
                      <div className="px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300/90 text-[12px]">
                        {mcpFormError}
                      </div>
                    )}
                    <Field
                      label="Name"
                      value={mcpForm.name}
                      limit={40}
                      onChange={(v) => setMcpForm((f) => ({ ...f, name: v.replace(/[^a-zA-Z0-9_-]/g, '') }))}
                      placeholder="e.g. inventory-system"
                    />
                    <Field
                      label="MCP server URL"
                      value={mcpForm.url}
                      limit={2000}
                      onChange={(v) => setMcpForm((f) => ({ ...f, url: v }))}
                      placeholder="https://your-system.example.com/mcp"
                    />
                    <div>
                      <label className="text-white/70 text-[12px] font-medium mb-1.5 block">Transport</label>
                      <div className="flex gap-2">
                        {(['streamable-http', 'sse'] as const).map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setMcpForm((f) => ({ ...f, transport: t }))}
                            className={`px-3.5 py-2 rounded-lg border text-[12.5px] transition-colors ${
                              mcpForm.transport === t
                                ? 'bg-[#b7cba6]/15 border-[#b7cba6]/30 text-[#dbe5d3]'
                                : 'bg-white/[0.04] border-white/10 text-white/50 hover:text-white/75'
                            }`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field
                        label="Auth header name (optional)"
                        value={mcpForm.authHeaderName}
                        limit={200}
                        onChange={(v) => setMcpForm((f) => ({ ...f, authHeaderName: v }))}
                        placeholder="e.g. X-Api-Key"
                      />
                      <Field
                        label="Auth header value (optional)"
                        value={mcpForm.authHeaderValue}
                        limit={4000}
                        onChange={(v) => setMcpForm((f) => ({ ...f, authHeaderValue: v }))}
                        placeholder="Encrypted at rest, never shown again"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleRegisterMcpServer}
                      disabled={mcpRegistering}
                      className="w-full py-2.5 rounded-lg bg-[#b7cba6]/20 hover:bg-[#b7cba6]/30 text-[#dbe5d3] text-[13px] font-medium transition-all border border-[#b7cba6]/30 disabled:opacity-50"
                    >
                      {mcpRegistering ? 'Registering & verifying…' : 'Register & verify server'}
                    </button>
                  </>
                )}
              </div>
            )
          )}
        </div>

        {tab === 'identity' && (
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
        )}
      </div>
    </div>
  );
}
