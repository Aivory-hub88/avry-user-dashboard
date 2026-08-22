'use client';

import Image from 'next/image';
import QRCode from 'react-qr-code';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AgentProfile,
  getAgentProfile,
  resetAgentProfile,
  saveAgentProfile,
} from '@/lib/agentProfiles';
import { ToolScope, getToolScope, saveToolScope } from '@/lib/agentToolScope';
import {
  ConnectableApp,
  ConnectedApp,
  getConnectableApps,
  getConnectedApps,
  revokeConnectedApp,
  startApiKeyConnect,
  startOAuthConnect,
} from '@/lib/integrationStatus';
import {
  TenantMcpServer,
  TenantMcpServerError,
  deleteTenantMcpServer,
  listTenantMcpServers,
  registerTenantMcpServer,
  reverifyTenantMcpServer,
} from '@/lib/tenantMcpServers';
import {
  createDeployLink,
  getLinkStatus,
  DeployLink,
  LinkStatus,
} from '@/lib/telegramDeploy';
import {
  createSlackDeployLink,
  getSlackLinkStatus,
  buildSlackOpenUrl,
  SlackDeployLink,
} from '@/lib/slackDeploy';
import {
  createDiscordDeployLink,
  getDiscordLinkStatus,
  DiscordDeployLink,
  DiscordLinkStatus,
} from '@/lib/discordDeploy';
import { createAgentApiKey, CreatedApiKey } from '@/lib/agentApiKeys';
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
  hubspot: 'HubSpot',
  slack: 'Slack',
  asana: 'Asana',
  erpnext: 'ERPNext',
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
  const [tab, setTab] = useState<'identity' | 'connections' | 'tools' | 'mcp' | 'deploy'>('identity');
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
  const [connectableApps, setConnectableApps] = useState<ConnectableApp[]>([]);
  const [connectBusyId, setConnectBusyId] = useState<string | null>(null);
  const [connectFeedback, setConnectFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const connectPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // API-key toolkit connect (ERPNext) — no OAuth popup exists for that
  // scheme, so the Connections tab renders an inline credential form and
  // submits it to /api/integrations/apikey/connect instead.
  const [apiKeyFormOpen, setApiKeyFormOpen] = useState(false);
  const [apiKeyBusy, setApiKeyBusy] = useState(false);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [erpnextBaseUrl, setErpNextBaseUrl] = useState('');
  const [erpnextApiKey, setErpNextApiKey] = useState('');
  const [erpnextApiSecret, setErpNextApiSecret] = useState('');

  const handleErpNextConnect = async () => {
    if (apiKeyBusy) return;
    setApiKeyError(null);
    if (!erpnextBaseUrl.trim() || !erpnextApiKey.trim() || !erpnextApiSecret.trim()) {
      setApiKeyError('Base URL, API Key, and API Secret are all required.');
      return;
    }
    setApiKeyBusy(true);
    try {
      await startApiKeyConnect('erpnext', {
        full: erpnextBaseUrl.trim(),
        generic_api_key: erpnextApiKey.trim(),
        generic_token: erpnextApiSecret.trim(),
      });
      setErpNextBaseUrl('');
      setErpNextApiKey('');
      setErpNextApiSecret('');
      setApiKeyFormOpen(false);
      setConnectFeedback({ type: 'success', message: 'ERPNext connected.' });
      refetchConnections();
    } catch (e: unknown) {
      setApiKeyError(e instanceof Error ? e.message : 'Could not connect ERPNext. Please try again.');
    } finally {
      setApiKeyBusy(false);
    }
  };


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

  // Deploy tab — was a separate modal (app/agents/page.tsx's DeployModal),
  // merged in so identity/connections/tools/MCP are configured before a
  // channel goes live, not as a competing entry point.
  const [deployView, setDeployView] = useState<'channels' | 'telegram' | 'slack' | 'discord' | 'api'>('channels');
  const [deployLink, setDeployLink] = useState<DeployLink | null>(null);
  const [slackLink, setSlackLink] = useState<SlackDeployLink | null>(null);
  const [slackTeamId, setSlackTeamId] = useState<string | null>(null);
  const [discordLink, setDiscordLink] = useState<DiscordDeployLink | null>(null);
  const [discordLinkStatus, setDiscordLinkStatus] = useState<DiscordLinkStatus>('pending');
  const [linkStatus, setLinkStatus] = useState<LinkStatus>('pending');
  const [deployLoading, setDeployLoading] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const deployPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [apiKeyLabel, setApiKeyLabel] = useState('');
  const [createdKey, setCreatedKey] = useState<CreatedApiKey | null>(null);
  const [apiKeyCopied, setApiKeyCopied] = useState(false);

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
    setConnectableApps([]);
    setConnectFeedback(null);
    setToolScope(undefined);
    setToolsFetched(false);
    setToolsError(null);
    setMcpServers([]);
    setMcpFetched(false);
    setMcpListError(null);
    setMcpForm({ name: '', url: '', transport: 'streamable-http', authHeaderName: '', authHeaderValue: '' });
    setMcpFormError(null);
    if (deployPollRef.current) { clearInterval(deployPollRef.current); deployPollRef.current = null; }
    setDeployView('channels');
    setDeployLink(null);
    setSlackLink(null);
    setSlackTeamId(null);
    setDiscordLink(null);
    setDiscordLinkStatus('pending');
    setLinkStatus('pending');
    setDeployLoading(false);
    setDeployError(null);
    setApiKeyLabel('');
    setCreatedKey(null);
    setApiKeyCopied(false);
  }, [isOpen, agentType]);

  // Stop deploy polling on unmount too, not just on modal-reopen.
  useEffect(() => {
    return () => { if (deployPollRef.current) clearInterval(deployPollRef.current); };
  }, []);

  const stopDeployPolling = useCallback(() => {
    if (deployPollRef.current) { clearInterval(deployPollRef.current); deployPollRef.current = null; }
  }, []);

  const startApiKeyCreate = async () => {
    if (!agentType || deployLoading) return;
    setDeployLoading(true);
    setDeployError(null);
    try {
      const key = await createAgentApiKey(agentType, apiKeyLabel.trim() || undefined);
      setCreatedKey(key);
    } catch (e: any) {
      setDeployError(e?.message || 'Could not create the API key. Please try again.');
    } finally {
      setDeployLoading(false);
    }
  };

  const startSlackDeploy = async () => {
    if (!agentType) return;
    setDeployLoading(true);
    setDeployError(null);
    try {
      const link = await createSlackDeployLink(agentType as any);
      setSlackLink(link);
      setSlackTeamId(null);
      setLinkStatus('pending');
      setDeployView('slack');
      // OAuth install is a one-time, admin-only, workspace-level action — it
      // needs a real browser (Slack login, workspace picker), so it opens
      // directly rather than via a QR scan. Once connected, a QR code
      // appears instead — that one just deep-links into the already-
      // installed agent's chat, which any team member can scan, no admin
      // needed.
      window.open(link.install_url, '_blank', 'noopener,noreferrer');
      stopDeployPolling();
      deployPollRef.current = setInterval(async () => {
        try {
          const res = await getSlackLinkStatus(link.token);
          if (res.status === 'connected' || res.status === 'expired') {
            setLinkStatus(res.status);
            if (res.team_id) setSlackTeamId(res.team_id);
            stopDeployPolling();
          }
        } catch { /* keep polling */ }
      }, 2500);
    } catch (e: any) {
      setDeployError(e?.message || 'Could not start the Slack install. Please try again.');
    } finally {
      setDeployLoading(false);
    }
  };

  const startTelegramDeploy = async () => {
    if (!agentType) return;
    setDeployLoading(true);
    setDeployError(null);
    try {
      const link = await createDeployLink(agentType as any);
      setDeployLink(link);
      setLinkStatus('pending');
      setDeployView('telegram');
      stopDeployPolling();
      deployPollRef.current = setInterval(async () => {
        try {
          const res = await getLinkStatus(link.token);
          if (res.status === 'connected' || res.status === 'expired') {
            setLinkStatus(res.status);
            stopDeployPolling();
          }
        } catch { /* keep polling */ }
      }, 2500);
    } catch (e: any) {
      setDeployError(e?.message || 'Could not create deploy link. Please try again.');
    } finally {
      setDeployLoading(false);
    }
  };

  const startDiscordDeploy = async () => {
    if (!agentType) return;
    setDeployLoading(true);
    setDeployError(null);
    try {
      const link = await createDiscordDeployLink(agentType as any);
      setDiscordLink(link);
      setDiscordLinkStatus('pending');
      setDeployView('discord');
      stopDeployPolling();
      deployPollRef.current = setInterval(async () => {
        try {
          const res = await getDiscordLinkStatus(link.code);
          if (res.status === 'connected' || res.status === 'expired') {
            setDiscordLinkStatus(res.status);
            stopDeployPolling();
          }
        } catch { /* keep polling */ }
      }, 2500);
    } catch (e: any) {
      setDeployError(e?.message || 'Could not create a connect code. Please try again.');
    } finally {
      setDeployLoading(false);
    }
  };

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
    Promise.all([getConnectedApps(), getConnectableApps().catch(() => [])])
      .then(([conns, apps]) => {
        setConnections(conns);
        setConnectableApps(apps);
      })
      .catch(() => setConnectionsError('Could not load your connections.'))
      .finally(() => {
        setConnectionsLoading(false);
        setConnectionsFetched(true);
      });
  }, [isOpen, tab, connectionsFetched, connectionsLoading]);

  // Stop polling if the modal closes or unmounts mid-connect.
  useEffect(() => {
    if (!isOpen && connectPollRef.current) {
      clearInterval(connectPollRef.current);
      connectPollRef.current = null;
    }
    return () => {
      if (connectPollRef.current) clearInterval(connectPollRef.current);
    };
  }, [isOpen]);

  const refetchConnections = () => {
    getConnectedApps().then(setConnections).catch(() => {});
  };

  // After the OAuth popup opens, poll for the connection to appear rather
  // than requiring the user to close the popup and manually refresh —
  // same shape the full /integrations page's own polling uses.
  const pollForConnection = (appId: string) => {
    if (connectPollRef.current) clearInterval(connectPollRef.current);
    const startedAt = Date.now();
    connectPollRef.current = setInterval(async () => {
      if (Date.now() - startedAt > 120000) {
        if (connectPollRef.current) clearInterval(connectPollRef.current);
        connectPollRef.current = null;
        return;
      }
      try {
        const conns = await getConnectedApps();
        const found = conns.find((c) => c.appId === appId && c.status === 'connected');
        if (found) {
          if (connectPollRef.current) clearInterval(connectPollRef.current);
          connectPollRef.current = null;
          setConnections(conns);
          setConnectFeedback({ type: 'success', message: `Connected ${found.appName}.` });
          setConnectBusyId(null);
        }
      } catch {
        // transient — keep polling until the 120s cap
      }
    }, 2000);
  };

  const handleConnect = async (app: ConnectableApp) => {
    if (connectBusyId) return;
    setConnectBusyId(app.id);
    setConnectFeedback(null);
    try {
      const popup = await startOAuthConnect(app.id);
      if (!popup) {
        setConnectFeedback({ type: 'error', message: 'Pop-up blocked — allow pop-ups for this site and try again.' });
        setConnectBusyId(null);
        return;
      }
      pollForConnection(app.id);
    } catch (e) {
      setConnectFeedback({ type: 'error', message: e instanceof Error ? e.message : `Could not connect ${app.name}.` });
      setConnectBusyId(null);
    }
  };

  const handleReconnect = async (conn: ConnectedApp) => {
    if (connectBusyId) return;
    setConnectBusyId(conn.appId);
    setConnectFeedback(null);
    try {
      const popup = await startOAuthConnect(conn.appId);
      if (!popup) {
        setConnectFeedback({ type: 'error', message: 'Pop-up blocked — allow pop-ups for this site and try again.' });
        setConnectBusyId(null);
        return;
      }
      pollForConnection(conn.appId);
    } catch (e) {
      setConnectFeedback({ type: 'error', message: e instanceof Error ? e.message : `Could not reconnect ${conn.appName}.` });
      setConnectBusyId(null);
    }
  };

  const handleRevoke = async (conn: ConnectedApp) => {
    if (connectBusyId) return;
    if (!confirm(`Revoke "${conn.displayName || conn.appName}"? This agent will lose access to it immediately.`)) return;
    setConnectBusyId(conn.appId);
    setConnectFeedback(null);
    try {
      await revokeConnectedApp(conn.id);
      setConnectFeedback({ type: 'success', message: `Revoked ${conn.appName}.` });
      refetchConnections();
    } catch (e) {
      setConnectFeedback({ type: 'error', message: e instanceof Error ? e.message : `Could not revoke ${conn.appName}.` });
    } finally {
      setConnectBusyId(null);
    }
  };

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
            {tab === 'connections' && 'Third-party apps this agent can use — connect or disconnect them right here.'}
            {tab === 'tools' && 'Turn off any external toolkit you don’t want this agent to use. Aivory’s built-in tools always stay on.'}
            {tab === 'mcp' && 'Connect this agent to your own systems by registering an MCP server you control. Pro plan and above, Aivory Cerveau agents only — every tool call requires your approval.'}
            {tab === 'deploy' && 'Once this agent is set up the way you want, put it to work on a channel.'}
          </p>
          <div className="flex items-center gap-1 border-b border-white/[0.06] -mb-4">
            {(['identity', 'connections', 'tools', 'mcp', 'deploy'] as const).map((t) => (
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
                <p className="text-white/60 text-[12px] leading-relaxed -mt-2">
                  <strong className="text-white/90 font-semibold">This is how your agent introduces itself inside the conversation — it does not change the bot&apos;s own account name shown in Discord/WhatsApp/Telegram, which stays &quot;Aivory Agent&quot;.</strong>
                </p>
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
            ) : (
              <>
                {connectFeedback && (
                  <div
                    className={`px-4 py-2.5 rounded-xl border text-[12px] flex items-center justify-between gap-3 ${
                      connectFeedback.type === 'success'
                        ? 'bg-[#b7cba6]/10 border-[#b7cba6]/25 text-[#dbe5d3]'
                        : 'bg-red-500/10 border-red-500/20 text-red-300/90'
                    }`}
                  >
                    <span>{connectFeedback.message}</span>
                    <button
                      type="button"
                      onClick={() => setConnectFeedback(null)}
                      className="text-current opacity-60 hover:opacity-100 shrink-0"
                    >
                      ×
                    </button>
                  </div>
                )}

                {connections && connections.length > 0 && (
                  <div className="space-y-2">
                    {connections.map((c) => {
                      const style = CONNECTION_STATUS_STYLES[c.status];
                      const app = connectableApps.find((a) => a.id === c.appId);
                      const busy = connectBusyId === c.appId;
                      return (
                        <div
                          key={c.id}
                          className="flex items-center justify-between px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06]"
                        >
                          <span className="flex items-center gap-2.5 text-white/80 text-[13px]">
                            {app?.iconPath && (
                              <Image src={asset(app.iconPath)} alt="" width={18} height={18} className="rounded-sm" />
                            )}
                            {c.displayName || c.appName}
                          </span>
                          <span className="flex items-center gap-2 shrink-0">
                            <span className={`px-2.5 py-1 rounded-full border text-[11px] font-medium ${style.className}`}>
                              {style.label}
                            </span>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleReconnect(c)}
                              className="px-2.5 py-1 rounded-lg border border-white/10 text-white/60 hover:text-white/90 hover:border-white/20 text-[11px] font-medium disabled:opacity-40 transition-colors"
                            >
                              {busy ? '…' : c.status === 'needs_reauth' ? 'Re-authenticate' : 'Reconnect'}
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleRevoke(c)}
                              className="px-2.5 py-1 rounded-lg border border-red-500/20 text-red-300/70 hover:text-red-300 hover:border-red-500/40 text-[11px] font-medium disabled:opacity-40 transition-colors"
                            >
                              Revoke
                            </button>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {toolScope?.tools?.erpnext === true &&
                  !(connections || []).some((c) => c.appId === 'erpnext' && c.status === 'connected') && (
                  <div className="px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2.5 text-white/80 text-[13px]">ERPNext</span>
                      <button
                        type="button"
                        onClick={() => { setApiKeyFormOpen((v) => !v); setApiKeyError(null); }}
                        className="px-3 py-1.5 rounded-lg bg-[#b7cba6]/15 border border-[#b7cba6]/25 text-[#dbe5d3] hover:bg-[#b7cba6]/25 text-[11.5px] font-medium transition-colors"
                      >
                        {apiKeyFormOpen ? 'Cancel' : 'Connect ERPNext'}
                      </button>
                    </div>
                    {apiKeyFormOpen && (
                      <div className="mt-3 space-y-2">
                        <p className="text-white/40 text-[11.5px] leading-relaxed">
                          In your Frappe/ERPNext instance: User list → your user → Settings → API Access → Generate Keys.
                        </p>
                        <input
                          type="text"
                          value={erpnextBaseUrl}
                          onChange={(e) => setErpNextBaseUrl(e.target.value)}
                          placeholder="https://your-company.com (Frappe instance URL)"
                          className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/10 text-white text-[12.5px] placeholder:text-white/25 focus:outline-none focus:border-[#b7cba6]/50"
                        />
                        <input
                          type="password"
                          value={erpnextApiKey}
                          onChange={(e) => setErpNextApiKey(e.target.value)}
                          placeholder="API Key"
                          className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/10 text-white text-[12.5px] placeholder:text-white/25 focus:outline-none focus:border-[#b7cba6]/50"
                        />
                        <input
                          type="password"
                          value={erpnextApiSecret}
                          onChange={(e) => setErpNextApiSecret(e.target.value)}
                          placeholder="API Secret"
                          className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/10 text-white text-[12.5px] placeholder:text-white/25 focus:outline-none focus:border-[#b7cba6]/50"
                        />
                        {apiKeyError && (
                          <p className="text-red-300/80 text-[11.5px]">{apiKeyError}</p>
                        )}
                        <button
                          type="button"
                          disabled={apiKeyBusy}
                          onClick={handleErpNextConnect}
                          className="w-full px-3 py-2 rounded-lg bg-[#b7cba6]/15 border border-[#b7cba6]/25 text-[#dbe5d3] hover:bg-[#b7cba6]/25 text-[12px] font-medium disabled:opacity-40 transition-colors"
                        >
                          {apiKeyBusy ? 'Connecting…' : 'Save & connect'}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {(() => {
                  const connectedIds = new Set((connections || []).filter((c) => c.status === 'connected').map((c) => c.appId));
                  const available = connectableApps.filter((a) => !connectedIds.has(a.id));
                  if (available.length === 0 && connections && connections.length > 0) return null;
                  return (
                    <div className={connections && connections.length > 0 ? 'pt-1' : ''}>
                      {available.length > 0 && (
                        <p className="text-white/35 text-[11px] uppercase tracking-wide mb-2 px-0.5">
                          {connections && connections.length > 0 ? 'Connect another app' : 'Available to connect'}
                        </p>
                      )}
                      <div className="space-y-2">
                        {available.map((app) => {
                          const busy = connectBusyId === app.id;
                          return (
                            <div
                              key={app.id}
                              className="flex items-center justify-between px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06]"
                            >
                              <span className="flex items-center gap-2.5 text-white/80 text-[13px]">
                                {app.iconPath && (
                                  <Image src={asset(app.iconPath)} alt="" width={18} height={18} className="rounded-sm" />
                                )}
                                {app.name}
                              </span>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleConnect(app)}
                                className="px-3 py-1.5 rounded-lg bg-[#b7cba6]/15 border border-[#b7cba6]/25 text-[#dbe5d3] hover:bg-[#b7cba6]/25 text-[11.5px] font-medium disabled:opacity-40 transition-colors"
                              >
                                {busy ? 'Connecting…' : (app.connectLabel ?? `Connect ${app.name}`)}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      {(!connections || connections.length === 0) && available.length === 0 && (
                        <div className="py-10 text-center text-white/40 text-[13px]">
                          No third-party apps available to connect right now.
                        </div>
                      )}
                    </div>
                  );
                })()}

                <a
                  href={asset('/integrations')}
                  className="block text-center text-white/35 hover:text-white/60 text-[11.5px] mt-3"
                >
                  Need a custom or API-key connection instead? Manage all connections →
                </a>
              </>
            )
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
                        className={`absolute left-[3px] top-[3px] w-4 h-4 rounded-full bg-white transition-transform ${
                          enabled ? 'translate-x-[16px]' : 'translate-x-0'
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

          {tab === 'deploy' && (
            deployView === 'channels' ? (
              <>
                {deployError && (
                  <div className="px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300/90 text-[12px] mb-1">
                    {deployError}
                  </div>
                )}
                <div className="space-y-2">
                  <button
                    onClick={startSlackDeploy}
                    disabled={!agentType || deployLoading}
                    className="w-full flex items-center gap-4 p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all text-left group disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center overflow-hidden shrink-0">
                      <Image src={asset('/integrations/icons/slack.svg')} alt="Slack" width={20} height={20} />
                    </div>
                    <div>
                      <div className="text-white/90 font-medium text-[14px]">Slack</div>
                      <div className="text-white/40 text-[12px] mt-0.5">{deployLoading ? 'Preparing install…' : 'Connect to a Slack workspace'}</div>
                    </div>
                    <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                      {deployLoading ? (
                        <div className="w-5 h-5 border-2 border-[#b7cba6]/30 border-t-[#b7cba6] rounded-full animate-spin" />
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-[#b7cba6]">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                      )}
                    </div>
                  </button>

                  <button
                    onClick={startTelegramDeploy}
                    disabled={!agentType || deployLoading}
                    className="w-full flex items-center gap-4 p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all text-left group disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden shrink-0">
                      <Image src={asset('/integrations/icons/telegram.svg')} alt="Telegram" width={40} height={40} />
                    </div>
                    <div>
                      <div className="text-white/90 font-medium text-[14px]">Telegram</div>
                      <div className="text-white/40 text-[12px] mt-0.5">{deployLoading ? 'Generating QR code…' : 'Deploy as a Telegram bot — scan a QR code'}</div>
                    </div>
                    <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                      {deployLoading ? (
                        <div className="w-5 h-5 border-2 border-[#b7cba6]/30 border-t-[#b7cba6] rounded-full animate-spin" />
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-[#b7cba6]">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                      )}
                    </div>
                  </button>

                  <button
                    onClick={startDiscordDeploy}
                    disabled={!agentType || deployLoading}
                    className="w-full flex items-center gap-4 p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all text-left group disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden shrink-0">
                      <Image src={asset('/integrations/icons/discord.svg')} alt="Discord" width={40} height={40} />
                    </div>
                    <div>
                      <div className="text-white/90 font-medium text-[14px]">Discord</div>
                      <div className="text-white/40 text-[12px] mt-0.5">{deployLoading ? 'Generating connect code…' : 'Deploy as a Discord bot — invite + connect code'}</div>
                    </div>
                    <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                      {deployLoading ? (
                        <div className="w-5 h-5 border-2 border-[#b7cba6]/30 border-t-[#b7cba6] rounded-full animate-spin" />
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-[#b7cba6]">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                      )}
                    </div>
                  </button>

                  <button
                    onClick={() => { setDeployError(null); setDeployView('api'); }}
                    disabled={!agentType}
                    className="w-full flex items-center gap-4 p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all text-left group disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden shrink-0">
                      <Image src={asset('/integrations/icons/http-api.svg')} alt="API" width={40} height={40} />
                    </div>
                    <div>
                      <div className="text-white/90 font-medium text-[14px]">API</div>
                      <div className="text-white/40 text-[12px] mt-0.5">Deploy to your own app or bot — Pro plan and above</div>
                    </div>
                    <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-[#b7cba6]">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>
                    </div>
                  </button>

                  <button className="w-full flex items-center gap-4 p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all text-left group">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden shrink-0">
                      <Image src={asset('/integrations/icons/whatsapp.svg')} alt="WhatsApp" width={40} height={40} />
                    </div>
                    <div>
                      <div className="text-white/90 font-medium text-[14px]">WhatsApp</div>
                      <div className="text-white/40 text-[12px] mt-0.5">Deploy to WhatsApp Business</div>
                    </div>
                    <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-[#b7cba6]">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>
                    </div>
                  </button>
                </div>
              </>
            ) : deployView === 'slack' && slackLink ? (
              <>
                <button onClick={() => { stopDeployPolling(); setDeployView('channels'); }} className="flex items-center gap-1.5 text-white/40 hover:text-white text-[12px] transition-colors mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                  </svg>
                  Back
                </button>

                <h4 className="text-white text-[15px] font-normal mb-1.5">
                  {linkStatus === 'connected' ? 'Agent connected' : 'Deploy to Slack'}
                </h4>
                <p className="text-white/60 text-[13px] leading-relaxed mb-5">
                  {linkStatus === 'connected'
                    ? <>Your <strong className="text-white font-medium">{slackLink.agent_name}</strong> is live in your Slack workspace. Open the chat below, or DM/@mention it directly.</>
                    : linkStatus === 'expired'
                    ? 'This install link has expired. Generate a new one to continue.'
                    : <>Approve the install in the Slack tab that just opened to connect your <strong className="text-white font-medium">{slackLink.agent_name}</strong>.</>}
                </p>

                <div className="flex flex-col items-center">
                  <div className={`w-[216px] h-[216px] rounded-2xl border flex flex-col items-center justify-center gap-3 ${linkStatus === 'connected' ? 'bg-[#b7cba6]/10 border-[#b7cba6]/30' : 'bg-white/[0.03] border-white/10'}`}>
                    {linkStatus === 'connected' ? (
                      <>
                        <div className="w-14 h-14 rounded-full bg-[#b7cba6]/20 flex items-center justify-center">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-7 h-7 text-[#b7cba6]">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        </div>
                        <span className="text-[#b7cba6] text-[13px] font-medium">Connected</span>
                      </>
                    ) : (
                      <>
                        <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center">
                          <Image src={asset('/integrations/icons/slack.svg')} alt="Slack" width={28} height={28} />
                        </div>
                        {linkStatus === 'expired' ? (
                          <button
                            onClick={startSlackDeploy}
                            disabled={deployLoading}
                            className="px-4 py-2 rounded-lg bg-[#242424] text-white text-[12px] font-medium border border-white/20 hover:border-[#b7cba6]/50 transition-all"
                          >
                            {deployLoading ? 'Generating…' : 'Generate new link'}
                          </button>
                        ) : (
                          <span className="text-white/50 text-[12px] px-6 text-center">Waiting for Slack authorization…</span>
                        )}
                      </>
                    )}
                  </div>

                  {linkStatus === 'connected' && slackTeamId && (
                    <a
                      href={buildSlackOpenUrl(slackTeamId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-4 w-full py-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/80 text-[13px] font-medium text-center transition-all border border-white/10"
                    >
                      Open chat in Slack
                    </a>
                  )}

                  {linkStatus === 'pending' && (
                    <>
                      <div className="flex items-center gap-2 mt-5 text-white/50 text-[12px]">
                        <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-[#b7cba6] rounded-full animate-spin" />
                        Waiting for approval…
                      </div>
                      <a
                        href={slackLink.install_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 text-[#b7cba6]/80 hover:text-[#b7cba6] text-[12px] underline underline-offset-2 transition-colors"
                      >
                        Re-open the Slack authorization page
                      </a>
                    </>
                  )}
                </div>
              </>
            ) : deployView === 'telegram' && deployLink ? (
              <>
                <button onClick={() => { stopDeployPolling(); setDeployView('channels'); }} className="flex items-center gap-1.5 text-white/40 hover:text-white text-[12px] transition-colors mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                  </svg>
                  Back
                </button>

                <h4 className="text-white text-[15px] font-normal mb-1.5">
                  {linkStatus === 'connected' ? 'Agent connected' : 'Deploy to Telegram'}
                </h4>
                <p className="text-white/60 text-[13px] leading-relaxed mb-5">
                  {linkStatus === 'connected'
                    ? <>Your <strong className="text-white font-medium">{deployLink.agent_name}</strong> is live in Telegram. Say hi!</>
                    : linkStatus === 'expired'
                    ? 'This QR code has expired. Generate a new one to continue.'
                    : <>Scan with your phone&apos;s camera or Telegram app to connect your <strong className="text-white font-medium">{deployLink.agent_name}</strong>.</>}
                </p>

                <div className="flex flex-col items-center">
                  {linkStatus === 'connected' ? (
                    <div className="w-[216px] h-[216px] rounded-2xl bg-[#b7cba6]/10 border border-[#b7cba6]/30 flex flex-col items-center justify-center gap-3">
                      <div className="w-14 h-14 rounded-full bg-[#b7cba6]/20 flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-7 h-7 text-[#b7cba6]">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      </div>
                      <span className="text-[#b7cba6] text-[13px] font-medium">Connected</span>
                    </div>
                  ) : (
                    <div className={`relative p-4 bg-white rounded-2xl ${linkStatus === 'expired' ? 'opacity-30' : ''}`}>
                      <QRCode value={deployLink.deep_link} size={184} level="M" />
                      {linkStatus === 'expired' && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <button
                            onClick={startTelegramDeploy}
                            disabled={deployLoading}
                            className="px-4 py-2 rounded-lg bg-[#242424] text-white text-[12px] font-medium border border-white/20 hover:border-[#b7cba6]/50 transition-all"
                          >
                            {deployLoading ? 'Generating…' : 'Generate new QR'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {linkStatus === 'pending' && (
                    <>
                      <div className="flex items-center gap-2 mt-5 text-white/50 text-[12px]">
                        <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-[#b7cba6] rounded-full animate-spin" />
                        Waiting for scan…
                      </div>
                      <a
                        href={deployLink.deep_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 text-[#b7cba6]/80 hover:text-[#b7cba6] text-[12px] underline underline-offset-2 transition-colors"
                      >
                        Or open in Telegram on this device
                      </a>
                    </>
                  )}
                </div>
              </>
            ) : deployView === 'discord' && discordLink ? (
              <>
                <button onClick={() => { stopDeployPolling(); setDeployView('channels'); }} className="flex items-center gap-1.5 text-white/40 hover:text-white text-[12px] transition-colors mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                  </svg>
                  Back
                </button>

                <h4 className="text-white text-[15px] font-normal mb-1.5">
                  {discordLinkStatus === 'connected' ? 'Agent connected' : 'Deploy to Discord'}
                </h4>
                <p className="text-white/60 text-[13px] leading-relaxed mb-5">
                  {discordLinkStatus === 'connected'
                    ? <>Your <strong className="text-white font-medium">{discordLink.agent_name}</strong> is live in that Discord channel. Say hi!</>
                    : discordLinkStatus === 'expired'
                    ? 'This connect code has expired. Generate a new one to continue.'
                    : <>Invite the bot, then type <code className="text-white/90 bg-white/10 rounded px-1 py-0.5">/connect</code> with the code below in the channel you want your <strong className="text-white font-medium">{discordLink.agent_name}</strong> to live in.</>}
                </p>

                <div className="flex flex-col items-center">
                  {discordLinkStatus === 'connected' ? (
                    <div className="w-[216px] h-[216px] rounded-2xl bg-[#b7cba6]/10 border border-[#b7cba6]/30 flex flex-col items-center justify-center gap-3">
                      <div className="w-14 h-14 rounded-full bg-[#b7cba6]/20 flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-7 h-7 text-[#b7cba6]">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      </div>
                      <span className="text-[#b7cba6] text-[13px] font-medium">Connected</span>
                    </div>
                  ) : (
                    <>
                      <a
                        href={discordLink.invite_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/90 text-[13px] font-medium transition-all mb-4"
                      >
                        <Image src={asset('/integrations/icons/discord.svg')} alt="Discord" width={18} height={18} />
                        1. Invite bot to your server
                      </a>

                      <div className={`w-full rounded-2xl border p-5 text-center ${discordLinkStatus === 'expired' ? 'opacity-30 bg-white/[0.03] border-white/10' : 'bg-white/[0.03] border-white/10'}`}>
                        <div className="text-white/40 text-[11px] uppercase tracking-wide mb-2">2. Type /connect with this code</div>
                        <div className="text-white text-[22px] font-mono tracking-[0.15em]">{discordLink.code}</div>
                      </div>
                      {discordLinkStatus === 'expired' && (
                        <button
                          onClick={startDiscordDeploy}
                          disabled={deployLoading}
                          className="mt-3 px-4 py-2 rounded-lg bg-[#242424] text-white text-[12px] font-medium border border-white/20 hover:border-[#b7cba6]/50 transition-all"
                        >
                          {deployLoading ? 'Generating…' : 'Generate new code'}
                        </button>
                      )}
                    </>
                  )}

                  {discordLinkStatus === 'pending' && (
                    <div className="flex items-center gap-2 mt-5 text-white/50 text-[12px]">
                      <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-[#b7cba6] rounded-full animate-spin" />
                      Waiting for /connect…
                    </div>
                  )}
                </div>
              </>
            ) : deployView === 'api' ? (
              <>
                <button onClick={() => setDeployView('channels')} className="flex items-center gap-1.5 text-white/40 hover:text-white text-[12px] transition-colors mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                  </svg>
                  Back
                </button>

                <h4 className="text-white text-[15px] font-normal mb-1.5">
                  {createdKey ? 'API key created' : 'Deploy via API'}
                </h4>
                <p className="text-white/60 text-[13px] leading-relaxed mb-4">
                  {createdKey
                    ? 'Copy this key now — it will not be shown again.'
                    : <>Send messages to your <strong className="text-white font-medium">{agentName}</strong> from your own app, bot, or backend.</>}
                </p>

                {deployError && (
                  <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300/90 text-[12px]">
                    {deployError}
                  </div>
                )}

                {!createdKey ? (
                  <>
                    <label className="block text-white/70 text-[12px] font-medium mb-1.5">Label (optional)</label>
                    <input
                      type="text"
                      value={apiKeyLabel}
                      onChange={(e) => setApiKeyLabel(e.target.value.slice(0, 200))}
                      placeholder="e.g. Discord bot prod"
                      className="w-full px-3.5 py-2.5 rounded-lg bg-white/[0.04] border border-white/10 text-white/90 text-[13px] placeholder-white/25 focus:outline-none focus:border-[#b7cba6]/40 transition-colors mb-4"
                    />
                    <button
                      onClick={startApiKeyCreate}
                      disabled={deployLoading}
                      className="w-full py-2.5 rounded-lg bg-[#b7cba6]/20 hover:bg-[#b7cba6]/30 text-[#dbe5d3] text-[13px] font-medium transition-all border border-[#b7cba6]/30 disabled:opacity-50"
                    >
                      {deployLoading ? 'Creating…' : 'Create API key'}
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-white/[0.04] border border-white/10 mb-2">
                      <code className="flex-1 text-[12px] text-[#dbe5d3] break-all">{createdKey.key}</code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(createdKey.key);
                          setApiKeyCopied(true);
                          setTimeout(() => setApiKeyCopied(false), 2000);
                        }}
                        className="shrink-0 px-2.5 py-1 rounded-md bg-white/[0.06] hover:bg-white/10 text-white/70 text-[11px] transition-colors"
                      >
                        {apiKeyCopied ? 'Copied ✓' : 'Copy'}
                      </button>
                    </div>
                    <p className="text-white/35 text-[11px] mb-4">
                      Store this somewhere safe — Aivory never stores or shows the plaintext key again.
                    </p>

                    <label className="block text-white/70 text-[12px] font-medium mb-1.5">Example request</label>
                    <pre className="w-full px-3.5 py-3 rounded-lg bg-black/30 border border-white/10 text-white/60 text-[10.5px] overflow-x-auto whitespace-pre-wrap break-all">
{`curl -X POST ${process.env.NEXT_PUBLIC_BACKEND_URL || 'https://backend.aivory.id'}/api/v1/agent-api/message \\
  -H "X-Aivory-Api-Key: ${createdKey.key}" \\
  -H "Content-Type: application/json" \\
  -d '{"text": "Hello!", "session_id": "your-own-thread-id"}'`}
                    </pre>
                  </>
                )}
              </>
            ) : null
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
