'use client';

import Image from 'next/image';
import QRCode from 'react-qr-code';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AgentProfile,
  getAgentProfile,
  resetAgentProfile,
  saveAgentProfile,
  uploadKnowledgeDocument,
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
  updateDisabledTools,
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
import SchedulesTab from '@/components/agents/SchedulesTab';

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
  knowledge: 12000,
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
  gmail: 'Gmail',
  googlecalendar: 'Google Calendar',
  trello: 'Trello',
  linear: 'Linear',
};

const CONNECTION_STATUS_STYLES: Record<ConnectedApp['status'], { label: string; className: string }> = {
  connected: { label: 'Connected', className: 'bg-accent/15 border-accent/25 text-[#dbe5d3]' },
  needs_reauth: { label: 'Needs reconnect', className: 'bg-amber-warn/15 border-amber-warn/25 text-amber-warn' },
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
  'w-full px-3.5 py-2.5 rounded-lg bg-white/[0.04] border border-white/10 text-white/90 text-[13px] placeholder-white/25 focus:outline-none focus:border-accent/40 transition-colors';

/** Tab key → its translation key. A lookup rather than a ternary chain so
 *  adding a tab is one line here, not a longer expression in the strip. */
const TAB_LABEL_KEY = {
  identity: 'tabIdentity',
  integrations: 'tabIntegrations',
  mcp: 'tabMcp',
  schedules: 'tabSchedules',
  deploy: 'tabDeploy',
} as const;

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
        <span className={`text-[10px] ${value.length > limit * 0.9 ? 'text-amber-warn/80' : 'text-white/25'}`}>
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
  const t = useTranslations('customizeAgent');
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
        <span className={`text-[10px] ${atMax ? 'text-amber-warn/80' : 'text-white/25'}`}>
          {selected.length > 0 ? (max ? t('selectedCountMax', { count: selected.length, max }) : t('selectedCount', { count: selected.length })) : max ? t('upToMax', { max }) : ''}
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
                className="inline-flex items-center gap-1 px-2 py-[2px] rounded-full bg-accent/15 border border-accent/25 text-[#dbe5d3] text-[11px]"
              >
                {v}
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); toggle(v); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); toggle(v); } }}
                  className="text-[#dbe5d3]/60 hover:text-white leading-none cursor-pointer"
                  aria-label={t('removeSelection', { value: v })}
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
                <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${checked ? 'bg-accent/80 border-accent' : disabled ? 'border-white/10' : 'border-white/25'}`}>
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
  const t = useTranslations('customizeAgent');
  const [tab, setTab] = useState<'identity' | 'integrations' | 'mcp' | 'schedules' | 'deploy'>('identity');
  const [fields, setFields] = useState<Record<FieldKey, string>>(EMPTY);
  const [hasProfile, setHasProfile] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [knowledgeUploadBusy, setKnowledgeUploadBusy] = useState(false);
  const [knowledgeUploadNotice, setKnowledgeUploadNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const knowledgeFileInputRef = useRef<HTMLInputElement>(null);

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
      setApiKeyError(t('erpnextRequired'));
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
      setConnectFeedback({ type: 'success', message: t('erpnextConnected') });
      refetchConnections();
    } catch (e: unknown) {
      setApiKeyError(e instanceof Error ? e.message : t('erpnextConnectFailed'));
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
  // The registration form is hidden once a server exists (the list takes
  // over), but must be re-openable — without this toggle a user who already
  // registered one server sees the MCP tab as if it were locked to that
  // single server, with no way to add another after removing it.
  const [mcpFormOpen, setMcpFormOpen] = useState(false);

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
      .catch(() => setError(t('loadIdentityFailed')))
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
    setMcpFormOpen(false);
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
      setDeployError(e?.message || t('apiKeyCreateFailed'));
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
      setDeployError(e?.message || t('slackDeployStartFailed'));
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
      setDeployError(e?.message || t('telegramDeployStartFailed'));
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
      setDeployError(e?.message || t('discordDeployStartFailed'));
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
    if (!isOpen || tab !== 'integrations' || connectionsFetched || connectionsLoading) return;
    setConnectionsLoading(true);
    setConnectionsError(null);
    Promise.all([getConnectedApps(), getConnectableApps().catch(() => [])])
      .then(([conns, apps]) => {
        setConnections(conns);
        setConnectableApps(apps);
      })
      .catch(() => setConnectionsError(t('loadConnectionsFailed')))
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
          setConnectFeedback({ type: 'success', message: t('connectedSuccess', { app: found.appName }) });
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
        setConnectFeedback({ type: 'error', message: t('popupBlocked') });
        setConnectBusyId(null);
        return;
      }
      pollForConnection(app.id);
    } catch (e) {
      setConnectFeedback({ type: 'error', message: e instanceof Error ? e.message : t('connectFailedGeneric', { app: app.name }) });
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
        setConnectFeedback({ type: 'error', message: t('popupBlocked') });
        setConnectBusyId(null);
        return;
      }
      pollForConnection(conn.appId);
    } catch (e) {
      setConnectFeedback({ type: 'error', message: e instanceof Error ? e.message : t('reconnectFailedGeneric', { app: conn.appName }) });
      setConnectBusyId(null);
    }
  };

  const handleRevoke = async (conn: ConnectedApp) => {
    if (connectBusyId) return;
    if (!confirm(t('revokeConfirm', { name: conn.displayName || conn.appName }))) return;
    setConnectBusyId(conn.appId);
    setConnectFeedback(null);
    try {
      await revokeConnectedApp(conn.id);
      setConnectFeedback({ type: 'success', message: t('revokedSuccess', { app: conn.appName }) });
      refetchConnections();
    } catch (e) {
      setConnectFeedback({ type: 'error', message: e instanceof Error ? e.message : t('revokeFailedGeneric', { app: conn.appName }) });
    } finally {
      setConnectBusyId(null);
    }
  };

  useEffect(() => {
    if (!isOpen || !agentType || tab !== 'integrations' || toolsFetched || toolsLoading) return;
    setToolsLoading(true);
    setToolsError(null);
    getToolScope(agentType)
      .then(setToolScope)
      .catch(() => setToolsError(t('loadToolSettingsFailed')))
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
      .catch((e) => setMcpListError(e instanceof TenantMcpServerError ? e.message : t('mcpListLoadFailed')))
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
      setToolsError(t('toolUpdateFailed', { toolkit: TOOLKIT_LABELS[slug] || slug }));
    } finally {
      setSavingToolkit(null);
    }
  };

  const handleRegisterMcpServer = async () => {
    if (!agentType || mcpRegistering) return;
    const name = mcpForm.name.trim();
    const url = mcpForm.url.trim();
    if (!name || !url) {
      setMcpFormError(t('mcpNameUrlRequired'));
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
      setMcpFormOpen(false);
    } catch (e) {
      if (e instanceof TenantMcpServerError && e.server) {
        // Verification failed, but the row WAS persisted — show it in the
        // list (status: verification_failed) rather than just an error.
        setMcpServers((prev) => [e.server as TenantMcpServer, ...prev]);
        setMcpForm({ name: '', url: '', transport: 'streamable-http', authHeaderName: '', authHeaderValue: '' });
        setMcpFormError(t('mcpSavedButFailed', { message: e.message }));
      } else {
        setMcpFormError(e instanceof TenantMcpServerError ? e.message : t('mcpRegisterFailed'));
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
        setMcpListError(e instanceof TenantMcpServerError ? e.message : t('mcpReverifyFailed'));
      }
    } finally {
      setMcpBusyId(null);
    }
  };

  const handleToggleMcpTool = async (server: TenantMcpServer, toolName: string, nextEnabled: boolean) => {
    if (mcpBusyId) return;
    const nextDisabled = nextEnabled
      ? server.disabled_tools.filter((n) => n !== toolName)
      : [...server.disabled_tools, toolName];
    // Optimistic — the PATCH validates against the server's own stored
    // tools_json, so this can only fail on a stale/removed tool name, not
    // on anything the checkbox itself could cause.
    setMcpServers((prev) => prev.map((s) => (s.id === server.id ? { ...s, disabled_tools: nextDisabled } : s)));
    setMcpBusyId(server.id);
    try {
      const result = await updateDisabledTools(server.id, nextDisabled);
      setMcpServers((prev) => prev.map((s) => (s.id === server.id ? result : s)));
    } catch (e) {
      setMcpServers((prev) => prev.map((s) => (s.id === server.id ? server : s)));
      setMcpListError(e instanceof TenantMcpServerError ? e.message : t('mcpToolUpdateFailed'));
    } finally {
      setMcpBusyId(null);
    }
  };

  const handleDeleteMcpServer = async (id: string, name: string) => {
    if (mcpBusyId) return;
    if (!window.confirm(t('mcpRemoveConfirm', { name }))) return;
    setMcpBusyId(id);
    setMcpListError(null);
    try {
      await deleteTenantMcpServer(id);
      setMcpServers((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      setMcpListError(e instanceof TenantMcpServerError ? e.message : t('mcpRemoveFailed'));
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
      // Agent name is no longer operator-editable (locked to "Aivory" so
      // nobody's misled into thinking the agent's own branding can change)
      // -- every save now normalises any old custom value back to default.
      payload.agent_name = null;
      await saveAgentProfile(agentType, payload);
      setHasProfile(true);
      setSaved(true);
    } catch {
      setError(t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleKnowledgeFile = async (file: File | undefined) => {
    if (!file || !agentType || knowledgeUploadBusy) return;
    setKnowledgeUploadBusy(true);
    setKnowledgeUploadNotice(null);
    try {
      const result = await uploadKnowledgeDocument(agentType, file);
      if (result.ingested) {
        // Cerveau: the document is already in the agent's memory, searchable
        // by relevance. Deliberately does NOT touch the knowledge field --
        // the text never went there, and writing to it would both overwrite
        // the operator's own edits and re-inject the whole document into
        // every prompt, which is exactly what this path exists to avoid.
        setKnowledgeUploadNotice({
          type: 'success',
          message: result.truncated
            ? t('knowledgeIngestedTrimmed', { file: file.name, chunks: result.chunks ?? 0 })
            : t('knowledgeIngested', { file: file.name, chunks: result.chunks ?? 0 }),
        });
      } else {
        set('knowledge')(result.knowledge);
        setKnowledgeUploadNotice({
          type: 'success',
          message: result.truncated
            ? t('knowledgeAddedTrimmed', { file: file.name })
            : t('knowledgeAdded', { file: file.name }),
        });
      }
    } catch (e: unknown) {
      setKnowledgeUploadNotice({
        type: 'error',
        message: e instanceof Error ? e.message : t('fileReadError'),
      });
    } finally {
      setKnowledgeUploadBusy(false);
      if (knowledgeFileInputRef.current) knowledgeFileInputRef.current.value = '';
    }
  };

  const handleReset = async () => {
    if (!agentType || saving) return;
    if (!window.confirm(t('resetConfirm'))) return;
    setSaving(true);
    setError(null);
    try {
      await resetAgentProfile(agentType);
      setFields({ ...EMPTY });
      setHasProfile(false);
      setSaved(true);
    } catch {
      setError(t('resetFailed'));
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
            {t('title', { name: agentName ?? '' })}
          </h3>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, margin: '0 0 16px' }}>
            {tab === 'identity' && t('descIdentity')}
            {tab === 'integrations' && t('descIntegrations')}
            {tab === 'mcp' && t('descMcp')}
            {tab === 'schedules' && t('descSchedules')}
            {tab === 'deploy' && t('descDeploy')}
          </p>
          <div className="flex items-center gap-1 border-b border-white/[0.06] -mb-4">
            {(['identity', 'integrations', 'mcp', 'schedules', 'deploy'] as const).map((tabKey) => (
              <button
                key={tabKey}
                type="button"
                onClick={() => setTab(tabKey)}
                className={`px-3.5 py-2.5 text-[12.5px] font-medium transition-colors border-b-2 -mb-px ${
                  tabKey === 'mcp' ? '' : 'capitalize'
                } ${
                  tab === tabKey
                    ? 'text-[#dbe5d3] border-accent'
                    : 'text-white/40 hover:text-white/65 border-transparent'
                }`}
              >
                {tabKey === 'mcp' ? 'MCP' : t(TAB_LABEL_KEY[tabKey])}
              </button>
            ))}
          </div>
        </div>

        <div className="px-8 overflow-y-auto flex-1 space-y-4 py-5 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          {tab === 'identity' && (
            loading ? (
              <div className="py-10 text-center text-white/40 text-[13px]">{t('loadingIdentity')}</div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-baseline justify-between mb-1.5">
                      <label className="text-white/70 text-[12px] font-medium">{t('agentNameLabel')}</label>
                    </div>
                    <div className={`${inputClass} flex items-center text-white/45 cursor-not-allowed`}>
                      Aivory
                    </div>
                  </div>
                  <Field label={t('businessNameLabel')} value={fields.business_name} limit={FIELD_LIMITS.business_name} onChange={set('business_name')} placeholder={t('businessNamePlaceholder')} />
                </div>
                <p className="text-white/60 text-[12px] leading-relaxed -mt-2">
                  <strong className="text-white/90 font-semibold">{t('fixedIdentityNote')}</strong>
                </p>
                <MultiSelect
                  label={t('toneLabel')}
                  placeholder={t('tonePlaceholder')}
                  options={TONES}
                  max={3}
                  selected={parseSelection(fields.tone, TONES)}
                  onChange={(tones) => set('tone')(tones.join(', '))}
                />
                <MultiSelect
                  label={t('languagesLabel')}
                  placeholder={t('languagesPlaceholder')}
                  options={LANGUAGES}
                  selected={parseSelection(fields.language_pref, LANGUAGES)}
                  onChange={(langs) => set('language_pref')(langs.join(', '))}
                />
                <Field
                  label={t('aboutBusinessLabel')}
                  value={fields.business_description}
                  limit={FIELD_LIMITS.business_description}
                  onChange={set('business_description')}
                  textarea
                  placeholder={t('aboutBusinessPlaceholder')}
                />
                <div>
                  <Field
                    label={t('knowledgeLabel')}
                    hint={t('knowledgeHint')}
                    value={fields.knowledge}
                    limit={FIELD_LIMITS.knowledge}
                    onChange={set('knowledge')}
                    textarea
                    rows={6}
                    placeholder={'Q: What are your opening hours?\nA: 09.00–21.00 WIB, every day.'}
                  />
                  <input
                    ref={knowledgeFileInputRef}
                    type="file"
                    accept=".pdf,.docx,.xlsx,.xlsm,.csv,.txt,.md"
                    className="hidden"
                    onChange={(e) => handleKnowledgeFile(e.target.files?.[0])}
                  />
                  <div className="mt-1.5 flex items-center gap-2">
                    <button
                      type="button"
                      disabled={knowledgeUploadBusy}
                      onClick={() => knowledgeFileInputRef.current?.click()}
                      className="px-2.5 py-1 rounded-lg bg-white/[0.05] border border-white/10 text-white/60 hover:text-white/90 hover:border-white/20 text-[11.5px] font-medium disabled:opacity-40 transition-colors"
                    >
                      {knowledgeUploadBusy ? t('uploadReading') : t('uploadDocument')}
                    </button>
                    <span className="text-white/30 text-[11px]">{t('uploadHint')}</span>
                  </div>
                  {knowledgeUploadNotice && (
                    <p className={`mt-1 text-[11.5px] ${knowledgeUploadNotice.type === 'success' ? 'text-accent' : 'text-red-300/80'}`}>
                      {knowledgeUploadNotice.message}
                    </p>
                  )}
                </div>
                <Field
                  label={t('extraNotesLabel')}
                  value={fields.custom_instructions}
                  limit={FIELD_LIMITS.custom_instructions}
                  onChange={set('custom_instructions')}
                  textarea
                  placeholder={t('extraNotesPlaceholder')}
                />
                <Field
                  label={t('greetingLabel')}
                  value={fields.greeting}
                  limit={FIELD_LIMITS.greeting}
                  onChange={set('greeting')}
                  placeholder={t('greetingPlaceholder')}
                />
              </>
            )
          )}

          {tab === 'integrations' && (
            (connectionsLoading || toolsLoading) ? (
              <div className="py-10 text-center text-white/40 text-[13px]">{t('loadingIntegrations')}</div>
            ) : (
              <div className="space-y-2">
                {(toolScope === undefined ? [] : Object.keys(toolScope?.tools ?? {})).length === 0 &&
                  toolScope !== null && (
                  <div className="py-10 text-center text-white/40 text-[13px]">
                    {t('noToolkits')}
                  </div>
                )}
                {Object.entries(toolScope?.tools ?? {}).map(([slug, enabled]) => {
                  const conn = (connections || []).find((c) => c.appId === slug && c.status === 'connected');
                  const style = CONNECTION_STATUS_STYLES[conn ? 'connected' : 'revoked'];
                  const busy = connectBusyId === slug || savingToolkit === slug;
                  const isApiKey = slug === 'erpnext';
                  const app = connectableApps.find((a) => a.id === slug);
                  return (
                    <div key={slug} className="px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                      <div className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2.5 text-white/80 text-[13px]">
                          {TOOLKIT_LABELS[slug] || slug}
                          <span className={`px-2 py-[2px] rounded-full border text-[10.5px] font-medium ${style.className}`}>
                            {conn ? t('connected') : t('notConnected')}
                          </span>
                        </span>
                        <span className="flex items-center gap-2 shrink-0">
                          {!isApiKey && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                if (app) handleConnect(app);
                                else setConnectFeedback({ type: 'error', message: t('connectStartError', { toolkit: TOOLKIT_LABELS[slug] || slug }) });
                              }}
                              className="px-2.5 py-1 rounded-lg bg-accent/15 border border-accent/25 text-[#dbe5d3] hover:bg-accent/25 text-[11px] font-medium disabled:opacity-40 transition-colors"
                            >
                              {busy ? '…' : t('connect')}
                            </button>
                          )}
                          {isApiKey && (
                            <button
                              type="button"
                              onClick={() => { setApiKeyFormOpen((v) => !v); setApiKeyError(null); }}
                              className="px-2.5 py-1 rounded-lg bg-accent/15 border border-accent/25 text-[#dbe5d3] hover:bg-accent/25 text-[11px] font-medium transition-colors"
                            >
                              {apiKeyFormOpen ? t('close') : t('connect')}
                            </button>
                          )}
                          {conn && (
                            <button
                              type="button"
                              disabled={connectBusyId === slug}
                              onClick={() => handleRevoke({ id: (connections || []).find((c) => c.appId === slug)?.id ?? '', appId: slug, status: 'connected' } as ConnectedApp)}
                              className="px-2.5 py-1 rounded-lg border border-red-500/20 text-red-300/70 hover:text-red-300 hover:border-red-500/40 text-[11px] font-medium disabled:opacity-40 transition-colors"
                            >
                              {t('revoke')}
                            </button>
                          )}
                          <button
                            type="button"
                            role="switch"
                            aria-checked={enabled}
                            disabled={!conn || savingToolkit === slug}
                            title={conn ? undefined : t('connectFirst')}
                            onClick={() => toggleToolkit(slug, !enabled)}
                            className={`relative w-10 h-[22px] rounded-full transition-colors disabled:opacity-30 ${
                              enabled ? 'bg-accent/70' : 'bg-white/10'
                            }`}
                          >
                            <span
                              className={`absolute left-[3px] top-[3px] w-4 h-4 rounded-full bg-white transition-transform ${
                                enabled ? 'translate-x-[16px]' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </span>
                      </div>
                      {isApiKey && apiKeyFormOpen && (
                        <div className="mt-3 space-y-2">
                          <p className="text-white/40 text-[11.5px] leading-relaxed">
                            {t('erpnextInstructions')}
                          </p>
                          <input
                            type="text"
                            value={erpnextBaseUrl}
                            onChange={(e) => setErpNextBaseUrl(e.target.value)}
                            placeholder={t('erpnextUrlPlaceholder')}
                            className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/10 text-white text-[12.5px] placeholder:text-white/25 focus:outline-none focus:border-accent/50"
                          />
                          <input
                            type="password"
                            value={erpnextApiKey}
                            onChange={(e) => setErpNextApiKey(e.target.value)}
                            placeholder={t('apiKeyPlaceholder')}
                            className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/10 text-white text-[12.5px] placeholder:text-white/25 focus:outline-none focus:border-accent/50"
                          />
                          <input
                            type="password"
                            value={erpnextApiSecret}
                            onChange={(e) => setErpNextApiSecret(e.target.value)}
                            placeholder={t('apiSecretPlaceholder')}
                            className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/10 text-white text-[12.5px] placeholder:text-white/25 focus:outline-none focus:border-accent/50"
                          />
                          {apiKeyError && (
                            <p className="text-red-300/80 text-[11.5px]">{apiKeyError}</p>
                          )}
                          <button
                            type="button"
                            disabled={apiKeyBusy}
                            onClick={handleErpNextConnect}
                            className="w-full px-3 py-2 rounded-lg bg-accent/15 border border-accent/25 text-[#dbe5d3] hover:bg-accent/25 text-[12px] font-medium disabled:opacity-40 transition-colors"
                          >
                            {apiKeyBusy ? t('connecting') : t('saveAndConnect')}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          )}

          {tab === 'mcp' && (
            mcpLoading ? (
              <div className="py-10 text-center text-white/40 text-[13px]">{t('loadingMcp')}</div>
            ) : (
              <div className="space-y-4">
                <div className="px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-white/45 text-[11.5px] leading-relaxed">
                  {t('mcpApprovalNote')}
                </div>

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
                          ? { label: s.tool_count != null ? t('mcpVerifiedTools', { count: s.tool_count }) : t('mcpVerified'), className: 'bg-accent/15 border-accent/25 text-[#dbe5d3]' }
                          : s.status === 'verification_failed'
                            ? { label: t('mcpVerificationFailed'), className: 'bg-red-500/10 border-red-500/20 text-red-300/90' }
                            : { label: t('mcpVerifying'), className: 'bg-amber-warn/15 border-amber-warn/25 text-amber-warn' };
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
                          {s.status === 'verified' && s.tools.length > 0 && (
                            <div className="mt-2.5 space-y-1 border-t border-white/[0.06] pt-2.5">
                              {s.tools.map((tool) => {
                                const toolEnabled = !s.disabled_tools.includes(tool.name);
                                return (
                                  <div key={tool.name} className="flex items-center justify-between gap-3 py-0.5">
                                    <div className="min-w-0">
                                      <div className="text-white/70 text-[12px] font-medium truncate">{tool.name}</div>
                                      {tool.description && (
                                        <div className="text-white/35 text-[11px] truncate">{tool.description}</div>
                                      )}
                                    </div>
                                    <button
                                      type="button"
                                      role="switch"
                                      aria-checked={toolEnabled}
                                      disabled={mcpBusyId === s.id}
                                      onClick={() => handleToggleMcpTool(s, tool.name, !toolEnabled)}
                                      className={`relative w-9 h-5 rounded-full shrink-0 transition-colors disabled:opacity-30 ${
                                        toolEnabled ? 'bg-accent/70' : 'bg-white/10'
                                      }`}
                                    >
                                      <span
                                        className={`absolute left-[3px] top-[3px] w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                                          toolEnabled ? 'translate-x-[14px]' : 'translate-x-0'
                                        }`}
                                      />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          <div className="mt-2.5 flex items-center gap-3">
                            <button
                              type="button"
                              disabled={mcpBusyId === s.id}
                              onClick={() => handleReverifyMcpServer(s.id)}
                              className="text-[#dbe5d3]/70 hover:text-[#dbe5d3] text-[11.5px] disabled:opacity-40"
                            >
                              {mcpBusyId === s.id ? t('mcpReverifyWorking') : t('mcpReverify')}
                            </button>
                            <button
                              type="button"
                              disabled={mcpBusyId === s.id}
                              onClick={() => handleDeleteMcpServer(s.id, s.name)}
                              className="text-red-300/60 hover:text-red-300/90 text-[11.5px] disabled:opacity-40"
                            >
                              {t('mcpRemove')}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {mcpServers.length > 0 && !mcpFormOpen && (
                  <button
                    type="button"
                    onClick={() => { setMcpFormError(null); setMcpFormOpen(true); }}
                    className="w-full py-2.5 rounded-lg bg-white/[0.05] hover:bg-white/10 border border-white/10 text-white/70 hover:text-white/90 text-[13px] font-medium transition-colors"
                  >
                    {t('mcpAddServer')}
                  </button>
                )}

                {(mcpServers.length === 0 || mcpFormOpen) && (
                  <>
                    {mcpFormError && (
                      <div className="px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300/90 text-[12px]">
                        {mcpFormError}
                      </div>
                    )}
                    <Field
                      label={t('mcpNameLabel')}
                      value={mcpForm.name}
                      limit={40}
                      onChange={(v) => setMcpForm((f) => ({ ...f, name: v.replace(/[^a-zA-Z0-9_-]/g, '') }))}
                      placeholder={t('mcpNamePlaceholder')}
                    />
                    <Field
                      label={t('mcpUrlLabel')}
                      value={mcpForm.url}
                      limit={2000}
                      onChange={(v) => setMcpForm((f) => ({ ...f, url: v }))}
                      placeholder={t('mcpUrlPlaceholder')}
                    />
                    <div>
                      <label className="text-white/70 text-[12px] font-medium mb-1.5 block">{t('mcpTransportLabel')}</label>
                      <div className="flex gap-2">
                        {(['streamable-http', 'sse'] as const).map((transportOption) => (
                          <button
                            key={transportOption}
                            type="button"
                            onClick={() => setMcpForm((f) => ({ ...f, transport: transportOption }))}
                            className={`px-3.5 py-2 rounded-lg border text-[12.5px] transition-colors ${
                              mcpForm.transport === transportOption
                                ? 'bg-accent/15 border-accent/30 text-[#dbe5d3]'
                                : 'bg-white/[0.04] border-white/10 text-white/50 hover:text-white/75'
                            }`}
                          >
                            {transportOption}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field
                        label={t('mcpAuthNameLabel')}
                        value={mcpForm.authHeaderName}
                        limit={200}
                        onChange={(v) => setMcpForm((f) => ({ ...f, authHeaderName: v }))}
                        placeholder={t('mcpAuthNamePlaceholder')}
                      />
                      <Field
                        label={t('mcpAuthValueLabel')}
                        value={mcpForm.authHeaderValue}
                        limit={4000}
                        onChange={(v) => setMcpForm((f) => ({ ...f, authHeaderValue: v }))}
                        placeholder={t('mcpAuthValuePlaceholder')}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleRegisterMcpServer}
                      disabled={mcpRegistering}
                      className="w-full py-2.5 rounded-lg bg-accent/20 hover:bg-accent/30 text-[#dbe5d3] text-[13px] font-medium transition-all border border-accent/30 disabled:opacity-50"
                    >
                      {mcpRegistering ? t('mcpRegistering') : t('mcpRegisterButton')}
                    </button>
                  </>
                )}
              </div>
            )
          )}

          {/* ADR-009 Phase 3. Its own component, mounted with one line: the
              tab owns all of its own state, and this file is long enough. */}
          {tab === 'schedules' && (
            agentType ? (
              <SchedulesTab key={agentType} agentType={agentType} />
            ) : (
              <div className="py-10 text-center text-white/40 text-[13px]">{t('scheduleNoAgent')}</div>
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
                      <div className="text-white/90 font-medium text-[14px]">{t('slack')}</div>
                      <div className="text-white/40 text-[12px] mt-0.5">{deployLoading ? t('slackPreparing') : t('slackConnectDesc')}</div>
                    </div>
                    <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                      {deployLoading ? (
                        <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-accent">
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
                      <div className="text-white/90 font-medium text-[14px]">{t('telegram')}</div>
                      <div className="text-white/40 text-[12px] mt-0.5">{deployLoading ? t('telegramGeneratingQr') : t('telegramConnectDesc')}</div>
                    </div>
                    <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                      {deployLoading ? (
                        <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-accent">
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
                      <div className="text-white/90 font-medium text-[14px]">{t('discord')}</div>
                      <div className="text-white/40 text-[12px] mt-0.5">{deployLoading ? t('discordGeneratingCode') : t('discordConnectDesc')}</div>
                    </div>
                    <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                      {deployLoading ? (
                        <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-accent">
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
                      <div className="text-white/90 font-medium text-[14px]">{t('api')}</div>
                      <div className="text-white/40 text-[12px] mt-0.5">{t('apiConnectDesc')}</div>
                    </div>
                    <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-accent">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>
                    </div>
                  </button>

                  <button className="w-full flex items-center gap-4 p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all text-left group">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden shrink-0">
                      <Image src={asset('/integrations/icons/whatsapp.svg')} alt="WhatsApp" width={40} height={40} />
                    </div>
                    <div>
                      <div className="text-white/90 font-medium text-[14px]">{t('whatsapp')}</div>
                      <div className="text-white/40 text-[12px] mt-0.5">{t('whatsappConnectDesc')}</div>
                    </div>
                    <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-accent">
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
                  {t('back')}
                </button>

                <h4 className="text-white text-[15px] font-normal mb-1.5">
                  {linkStatus === 'connected' ? t('agentConnected') : t('deployToSlack')}
                </h4>
                <p className="text-white/60 text-[13px] leading-relaxed mb-5">
                  {linkStatus === 'connected'
                    ? <>{t('slackConnectedPre')}<strong className="text-white font-medium">{slackLink.agent_name}</strong>{t('slackConnectedPost')}</>
                    : linkStatus === 'expired'
                    ? t('slackExpired')
                    : <>{t('slackApprovePre')}<strong className="text-white font-medium">{slackLink.agent_name}</strong>{t('slackApprovePost')}</>}
                </p>

                <div className="flex flex-col items-center">
                  <div className={`w-[216px] h-[216px] rounded-2xl border flex flex-col items-center justify-center gap-3 ${linkStatus === 'connected' ? 'bg-accent/10 border-accent/30' : 'bg-white/[0.03] border-white/10'}`}>
                    {linkStatus === 'connected' ? (
                      <>
                        <div className="w-14 h-14 rounded-full bg-accent/20 flex items-center justify-center">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-7 h-7 text-accent">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        </div>
                        <span className="text-accent text-[13px] font-medium">{t('connectedBadge')}</span>
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
                            className="px-4 py-2 rounded-lg bg-[#242424] text-white text-[12px] font-medium border border-white/20 hover:border-accent/50 transition-all"
                          >
                            {deployLoading ? t('generating') : t('generateNewLink')}
                          </button>
                        ) : (
                          <span className="text-white/50 text-[12px] px-6 text-center">{t('waitingSlackAuth')}</span>
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
                      {t('openChatInSlack')}
                    </a>
                  )}

                  {linkStatus === 'pending' && (
                    <>
                      <div className="flex items-center gap-2 mt-5 text-white/50 text-[12px]">
                        <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-accent rounded-full animate-spin" />
                        {t('waitingApproval')}
                      </div>
                      <a
                        href={slackLink.install_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 text-accent/80 hover:text-accent text-[12px] underline underline-offset-2 transition-colors"
                      >
                        {t('reopenSlackAuth')}
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
                  {t('back')}
                </button>

                <h4 className="text-white text-[15px] font-normal mb-1.5">
                  {linkStatus === 'connected' ? t('agentConnected') : t('deployToTelegram')}
                </h4>
                <p className="text-white/60 text-[13px] leading-relaxed mb-5">
                  {linkStatus === 'connected'
                    ? <>{t('telegramConnectedPre')}<strong className="text-white font-medium">{deployLink.agent_name}</strong>{t('telegramConnectedPost')}</>
                    : linkStatus === 'expired'
                    ? t('telegramExpired')
                    : <>{t('telegramScanPre')}<strong className="text-white font-medium">{deployLink.agent_name}</strong>{t('telegramScanPost')}</>}
                </p>

                <div className="flex flex-col items-center">
                  {linkStatus === 'connected' ? (
                    <div className="w-[216px] h-[216px] rounded-2xl bg-accent/10 border border-accent/30 flex flex-col items-center justify-center gap-3">
                      <div className="w-14 h-14 rounded-full bg-accent/20 flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-7 h-7 text-accent">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      </div>
                      <span className="text-accent text-[13px] font-medium">{t('connectedBadge')}</span>
                    </div>
                  ) : (
                    <div className={`relative p-4 bg-white rounded-2xl ${linkStatus === 'expired' ? 'opacity-30' : ''}`}>
                      <QRCode value={deployLink.deep_link} size={184} level="M" />
                      {linkStatus === 'expired' && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <button
                            onClick={startTelegramDeploy}
                            disabled={deployLoading}
                            className="px-4 py-2 rounded-lg bg-[#242424] text-white text-[12px] font-medium border border-white/20 hover:border-accent/50 transition-all"
                          >
                            {deployLoading ? t('generating') : t('generateNewQr')}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {linkStatus === 'pending' && (
                    <>
                      <div className="flex items-center gap-2 mt-5 text-white/50 text-[12px]">
                        <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-accent rounded-full animate-spin" />
                        {t('waitingScan')}
                      </div>
                      <a
                        href={deployLink.deep_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 text-accent/80 hover:text-accent text-[12px] underline underline-offset-2 transition-colors"
                      >
                        {t('openInTelegramDevice')}
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
                  {t('back')}
                </button>

                <h4 className="text-white text-[15px] font-normal mb-1.5">
                  {discordLinkStatus === 'connected' ? t('agentConnected') : t('deployToDiscord')}
                </h4>
                <p className="text-white/60 text-[13px] leading-relaxed mb-5">
                  {discordLinkStatus === 'connected'
                    ? <>{t('discordConnectedPre')}<strong className="text-white font-medium">{discordLink.agent_name}</strong>{t('discordConnectedPost')}</>
                    : discordLinkStatus === 'expired'
                    ? t('discordExpired')
                    : <>{t('discordInvitePre')}<code className="text-white/90 bg-white/10 rounded px-1 py-0.5">/connect</code>{t('discordInvitePost')}<strong className="text-white font-medium">{discordLink.agent_name}</strong>{t('discordInviteEnd')}</>}
                </p>

                <div className="flex flex-col items-center">
                  {discordLinkStatus === 'connected' ? (
                    <div className="w-[216px] h-[216px] rounded-2xl bg-accent/10 border border-accent/30 flex flex-col items-center justify-center gap-3">
                      <div className="w-14 h-14 rounded-full bg-accent/20 flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-7 h-7 text-accent">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      </div>
                      <span className="text-accent text-[13px] font-medium">{t('connectedBadge')}</span>
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
                        {t('inviteBotStep')}
                      </a>

                      <div className={`w-full rounded-2xl border p-5 text-center ${discordLinkStatus === 'expired' ? 'opacity-30 bg-white/[0.03] border-white/10' : 'bg-white/[0.03] border-white/10'}`}>
                        <div className="text-white/40 text-[11px] uppercase tracking-wide mb-2">{t('typeConnectStep')}</div>
                        <div className="text-white text-[22px] font-mono tracking-[0.15em]">{discordLink.code}</div>
                      </div>
                      {discordLinkStatus === 'expired' && (
                        <button
                          onClick={startDiscordDeploy}
                          disabled={deployLoading}
                          className="mt-3 px-4 py-2 rounded-lg bg-[#242424] text-white text-[12px] font-medium border border-white/20 hover:border-accent/50 transition-all"
                        >
                          {deployLoading ? t('generating') : t('generateNewCode')}
                        </button>
                      )}
                    </>
                  )}

                  {discordLinkStatus === 'pending' && (
                    <div className="flex items-center gap-2 mt-5 text-white/50 text-[12px]">
                      <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-accent rounded-full animate-spin" />
                      {t('waitingConnectCommand')}
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
                  {t('back')}
                </button>

                <h4 className="text-white text-[15px] font-normal mb-1.5">
                  {createdKey ? t('apiKeyCreated') : t('deployViaApi')}
                </h4>
                <p className="text-white/60 text-[13px] leading-relaxed mb-4">
                  {createdKey
                    ? t('copyKeyNotice')
                    : <>{t('sendMessagesPre')}<strong className="text-white font-medium">{agentName}</strong>{t('sendMessagesPost')}</>}
                </p>

                {deployError && (
                  <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300/90 text-[12px]">
                    {deployError}
                  </div>
                )}

                {!createdKey ? (
                  <>
                    <label className="block text-white/70 text-[12px] font-medium mb-1.5">{t('labelOptional')}</label>
                    <input
                      type="text"
                      value={apiKeyLabel}
                      onChange={(e) => setApiKeyLabel(e.target.value.slice(0, 200))}
                      placeholder={t('labelPlaceholder')}
                      className="w-full px-3.5 py-2.5 rounded-lg bg-white/[0.04] border border-white/10 text-white/90 text-[13px] placeholder-white/25 focus:outline-none focus:border-accent/40 transition-colors mb-4"
                    />
                    <button
                      onClick={startApiKeyCreate}
                      disabled={deployLoading}
                      className="w-full py-2.5 rounded-lg bg-accent/20 hover:bg-accent/30 text-[#dbe5d3] text-[13px] font-medium transition-all border border-accent/30 disabled:opacity-50"
                    >
                      {deployLoading ? t('creating') : t('createApiKey')}
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
                        {apiKeyCopied ? t('copied') : t('copy')}
                      </button>
                    </div>
                    <p className="text-white/35 text-[11px] mb-4">
                      {t('storeKeySafely')}
                    </p>

                    <label className="block text-white/70 text-[12px] font-medium mb-1.5">{t('exampleRequest')}</label>
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
              className="flex-1 py-2.5 rounded-lg bg-accent/20 hover:bg-accent/30 text-[#dbe5d3] text-[13px] font-medium transition-all border border-accent/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? t('saving') : saved ? t('saved') : t('saveIdentity')}
            </button>
            {hasProfile && (
              <button
                onClick={handleReset}
                disabled={saving || loading}
                className="px-4 py-2.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-white/60 hover:text-white/85 text-[13px] transition-all border border-white/10 disabled:opacity-50"
              >
                {t('resetToDefault')}
              </button>
            )}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
