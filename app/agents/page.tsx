'use client';
import { asset } from "@/lib/asset";

import { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
import QRCode from 'react-qr-code';
import {
  createDeployLink,
  getLinkStatus,
  DeployLink,
  LinkStatus,
  TelegramAgentType,
} from '@/lib/telegramDeploy';
import {
  createSlackDeployLink,
  getSlackLinkStatus,
  SlackDeployLink,
} from '@/lib/slackDeploy';
import { listAgentActions, AgentAction } from '@/lib/agentActions';
import { listDeployments, deleteDeployment, AgentDeployment } from '@/lib/agentChat';

const NoiseOverlay = () => (
  <>
    {/* Layer 1 — coarse grain, high visibility */}
    <div 
      className="absolute inset-0 pointer-events-none z-[2]"
      style={{
        opacity: 0.48,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='g1'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g1)'/%3E%3C/svg%3E")`,
        mixBlendMode: 'overlay',
      }}
    />
    {/* Layer 2 — fine grain for depth */}
    <div 
      className="absolute inset-0 pointer-events-none z-[2]"
      style={{
        opacity: 0.35,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='g2'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.1' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g2)'/%3E%3C/svg%3E")`,
        mixBlendMode: 'soft-light',
      }}
    />
    {/* Layer 3 — ultra-fine specks */}
    <div 
      className="absolute inset-0 pointer-events-none z-[2]"
      style={{
        opacity: 0.18,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 128 128' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='g3'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='2.5' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g3)'/%3E%3C/svg%3E")`,
        mixBlendMode: 'multiply',
      }}
    />
  </>
);

/* Premium multi-stop radial gradients — organic aurora-like blobs */
const AGENT_GRADIENTS = {
  autonomous: [
    'radial-gradient(ellipse 120% 140% at 15% 10%, #6b21a8 0%, transparent 55%)',
    'radial-gradient(ellipse 100% 120% at 85% 80%, #ea580c 0%, transparent 50%)',
    'radial-gradient(ellipse 80% 100% at 50% 50%, #7c3aed 0%, transparent 60%)',
    'radial-gradient(ellipse 60% 80% at 80% 20%, #2563eb 0%, transparent 50%)',
    'linear-gradient(135deg, #1e1040 0%, #2d1060 50%, #1a0a30 100%)',
  ].join(', '),
  service: [
    'radial-gradient(ellipse 110% 130% at 10% 20%, #0369a1 0%, transparent 55%)',
    'radial-gradient(ellipse 90% 110% at 90% 70%, #f59e0b 0%, transparent 45%)',
    'radial-gradient(ellipse 100% 100% at 50% 40%, #0ea5e9 0%, transparent 55%)',
    'radial-gradient(ellipse 70% 90% at 75% 15%, #ec4899 0%, transparent 50%)',
    'linear-gradient(135deg, #0c1a2e 0%, #0f2848 50%, #0a1628 100%)',
  ].join(', '),
  leads: [
    'radial-gradient(ellipse 100% 130% at 20% 85%, #d97706 0%, transparent 50%)',
    'radial-gradient(ellipse 120% 110% at 80% 15%, #065f46 0%, transparent 55%)',
    'radial-gradient(ellipse 80% 100% at 50% 50%, #0f766e 0%, transparent 55%)',
    'radial-gradient(ellipse 60% 70% at 15% 20%, #1d4ed8 0%, transparent 50%)',
    'linear-gradient(135deg, #0a1a14 0%, #0c2420 50%, #091410 100%)',
  ].join(', '),
  finance: [
    'radial-gradient(ellipse 120% 140% at 80% 90%, #ea580c 0%, transparent 50%)',
    'radial-gradient(ellipse 100% 100% at 20% 20%, #b91c1c 0%, transparent 50%)',
    'radial-gradient(ellipse 90% 120% at 60% 40%, #d97706 0%, transparent 55%)',
    'radial-gradient(ellipse 70% 80% at 10% 80%, #7c2d12 0%, transparent 50%)',
    'linear-gradient(135deg, #1a0e08 0%, #2a1408 50%, #140a04 100%)',
  ].join(', '),
  office: [
    'radial-gradient(ellipse 110% 130% at 85% 10%, #4338ca 0%, transparent 55%)',
    'radial-gradient(ellipse 90% 110% at 15% 85%, #b45309 0%, transparent 45%)',
    'radial-gradient(ellipse 100% 100% at 40% 40%, #6d28d9 0%, transparent 55%)',
    'radial-gradient(ellipse 60% 80% at 10% 15%, #0e7490 0%, transparent 50%)',
    'linear-gradient(135deg, #14122e 0%, #1c1440 50%, #0e0a24 100%)',
  ].join(', '),
};

const AGENTS = [
  {
    agentType: 'autonomous' as TelegramAgentType,
    title: 'Autonomous Agent',
    description: 'Deploy autonomous agents inside your communication hubs. They triage, respond, and update your CRM 24/7.',
    tools: ['Web search', 'Leads & tickets', 'Invoices', 'Workflows', 'Integrations'],
    gradient: AGENT_GRADIENTS.autonomous,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
      </svg>
    )
  },
  {
    agentType: 'customer_service' as TelegramAgentType,
    title: 'Customer Service Agent',
    description: 'Handle inbound support 24/7. Automatically triage, resolve, and escalate to a human if necessary.',
    tools: ['Support tickets', 'Human handoff', 'Web search', 'SLA workflows'],
    gradient: AGENT_GRADIENTS.service,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z" />
      </svg>
    )
  },
  {
    agentType: 'leads_qualifier' as TelegramAgentType,
    title: 'Leads Qualifier Agent',
    description: 'Filter inbound leads using the BANT framework. Qualified leads are automatically routed to sales.',
    tools: ['BANT scoring', 'Lead capture', 'Sales routing', 'Web search'],
    gradient: AGENT_GRADIENTS.leads,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
      </svg>
    )
  },
  {
    agentType: 'finance_invoice_ops' as TelegramAgentType,
    title: 'Finance & Invoice Ops Agent',
    description: 'Automate invoice processing, anomaly detection, and multi-tier approval routing - end to end.',
    tools: ['Invoice ledger', 'Anomaly flags', 'Approval routing', 'Calculator'],
    gradient: AGENT_GRADIENTS.finance,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    )
  },
  {
    agentType: 'office_assistant' as TelegramAgentType,
    title: 'Office Assistant',
    description: 'Save 4 hours per week by automatically extracting action items and syncing decisions to your workspace.',
    tools: ['Meeting summaries', 'Action items', 'Notion sync', 'Slack alerts', 'Sheets log'],
    enterprise: true,
    gradient: AGENT_GRADIENTS.office,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
      </svg>
    )
  }
];

function HeroBanner() {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const heroRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!heroRef.current) return;
    const rect = heroRef.current.getBoundingClientRect();
    setMousePosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <div
      ref={heroRef}
      onMouseMove={handleMouseMove}
      className="rounded-2xl p-6 md:p-8 mb-8 shadow-lg relative overflow-hidden border border-white/[0.06]"
      style={{
        background: [
          'radial-gradient(ellipse 90% 120% at 12% 0%, rgba(183,203,166,0.16) 0%, transparent 55%)',
          'radial-gradient(ellipse 70% 90% at 92% 100%, rgba(221,218,197,0.10) 0%, transparent 55%)',
          'linear-gradient(135deg, #46483f 0%, #3a3c34 55%, #2c2e27 100%)',
        ].join(', '),
      }}
    >
      <NoiseOverlay />
      {/* Cursor-tracked highlight — same spotlight language as the agent cards below */}
      <div
        className="pointer-events-none absolute inset-0 z-[3] opacity-0 hover:opacity-100 transition-opacity duration-300"
        style={{ background: `radial-gradient(600px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(255,255,255,0.05), transparent 45%)` }}
      />
      <div className="relative z-10">
        <span className="inline-block text-[10px] font-semibold text-[#dddac5]/80 uppercase tracking-[0.12em] mb-3 px-2.5 py-[3px] rounded-full bg-white/[0.06] border border-white/[0.08]">
          Agents
        </span>
        {/* globals.css has an unlayered `main h2/p{...}` rule that beats any
            Tailwind class regardless of specificity — inline style is the only
            reliable override. */}
        <h2
          className="text-white text-balance"
          style={{ fontSize: 22, fontWeight: 300, lineHeight: 1.25, letterSpacing: '-0.2px', margin: '0 0 10px', color: '#fff' }}
        >
          Meet your team where they already work
        </h2>
        <p style={{ fontSize: 13, fontWeight: 300, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, margin: 0, maxWidth: '36rem' }}>
          Deploy any Aivory agent directly to your communication channels, no extra apps, no friction.
        </p>
      </div>
      {/* Decorative background glows */}
      <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-[#b7cba6]/[0.06] rounded-full blur-3xl" />
      <div className="absolute -top-16 -left-12 w-56 h-56 bg-white/[0.04] rounded-full blur-3xl" />
    </div>
  );
}

function IntegrationsRow() {
  return (
    <div className="flex flex-col sm:flex-row items-stretch gap-3 mb-8">
      <div className="flex items-center gap-3.5 px-4 py-3 rounded-xl bg-white/[0.025] border border-white/[0.06] shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm ring-1 ring-white/10 hover:scale-105 transition-transform cursor-pointer overflow-hidden">
            <Image src={asset("/dashboard/integrations/icons/slack.svg")} alt="Slack" width={16} height={16} />
          </div>
          <div className="w-8 h-8 rounded-full flex items-center justify-center shadow-sm ring-1 ring-white/10 hover:scale-105 transition-transform cursor-pointer overflow-hidden">
            <Image src={asset("/dashboard/integrations/icons/telegram.svg")} alt="Telegram" width={32} height={32} />
          </div>
        </div>
        <div className="w-px self-stretch bg-white/[0.07]" />
        <span className="text-white/50 text-[10px] uppercase tracking-wider font-medium leading-snug">
          Available for<br className="hidden sm:block"/>all tiers
        </span>
      </div>

      <div className="flex items-center gap-3.5 px-4 py-3 rounded-xl bg-white/[0.025] border border-white/[0.06] shadow-sm">
        <div className="w-8 h-8 rounded-full flex items-center justify-center shadow-sm ring-1 ring-white/10 hover:scale-105 transition-transform cursor-pointer overflow-hidden">
          <Image src={asset("/dashboard/integrations/icons/whatsapp.svg")} alt="WhatsApp" width={32} height={32} />
        </div>
        <div className="w-px self-stretch bg-white/[0.07]" />
        <span className="inline-flex items-center gap-1.5 text-[#e8b96a]/90 text-[10px] uppercase tracking-wider font-medium">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-2.5 h-2.5 shrink-0">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
          Enterprise plan only
        </span>
      </div>
    </div>
  );
}

function DeployModal({ isOpen, onClose, agentName, agentType }: { isOpen: boolean, onClose: () => void, agentName: string | null, agentType: TelegramAgentType | null }) {
  const [view, setView] = useState<'channels' | 'telegram' | 'slack'>('channels');
  const [deployLink, setDeployLink] = useState<DeployLink | null>(null);
  const [slackLink, setSlackLink] = useState<SlackDeployLink | null>(null);
  const [linkStatus, setLinkStatus] = useState<LinkStatus>('pending');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  // Reset everything whenever the modal closes
  useEffect(() => {
    if (!isOpen) {
      stopPolling();
      setView('channels');
      setDeployLink(null);
      setSlackLink(null);
      setLinkStatus('pending');
      setError(null);
      setLoading(false);
    }
    return stopPolling;
  }, [isOpen, stopPolling]);

  const startSlackDeploy = async () => {
    if (!agentType) return;
    setLoading(true);
    setError(null);
    try {
      const link = await createSlackDeployLink(agentType);
      setSlackLink(link);
      setLinkStatus('pending');
      setView('slack');
      // Open Slack's consent screen in a new tab; polling below picks up the result
      window.open(link.install_url, '_blank', 'noopener,noreferrer');
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const res = await getSlackLinkStatus(link.token);
          if (res.status === 'connected' || res.status === 'expired') {
            setLinkStatus(res.status);
            stopPolling();
          }
        } catch { /* keep polling */ }
      }, 2500);
    } catch (e: any) {
      setError(e?.message || 'Could not start the Slack install. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const startTelegramDeploy = async () => {
    if (!agentType) return;
    setLoading(true);
    setError(null);
    try {
      const link = await createDeployLink(agentType);
      setDeployLink(link);
      setLinkStatus('pending');
      setView('telegram');
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const res = await getLinkStatus(link.token);
          if (res.status === 'connected' || res.status === 'expired') {
            setLinkStatus(res.status);
            stopPolling();
          }
        } catch { /* keep polling */ }
      }, 2500);
    } catch (e: any) {
      setError(e?.message || 'Could not create deploy link. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#242424] border border-white/10 rounded-[24px] p-8 w-full max-w-md shadow-2xl relative" onClick={e => e.stopPropagation()}>
        {/* Close Button */}
        <button onClick={onClose} className="absolute top-6 right-6 text-white/40 hover:text-white transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {view === 'channels' && (
          <>
            <h3 style={{ fontSize: 20, fontWeight: 300, color: '#fff', margin: '0 0 8px', lineHeight: 1.3 }}>Deploy Agent</h3>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, margin: '0 0 32px' }}>Select a communication channel to connect your <strong className="text-white font-medium">{agentName}</strong>.</p>

            {error && (
              <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300/90 text-[12px]">
                {error}
              </div>
            )}

            <div className="space-y-3">
              {/* Slack Option */}
              <button
                onClick={startSlackDeploy}
                disabled={!agentType || loading}
                className="w-full flex items-center gap-4 p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all text-left group disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center overflow-hidden shrink-0">
                  <Image src={asset("/dashboard/integrations/icons/slack.svg")} alt="Slack" width={20} height={20} />
                </div>
                <div>
                  <div className="text-white/90 font-medium text-[14px]">Slack</div>
                  <div className="text-white/40 text-[12px] mt-0.5">{loading ? 'Preparing install…' : 'Connect to a Slack workspace'}</div>
                </div>
                <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-[#b7cba6]/30 border-t-[#b7cba6] rounded-full animate-spin" />
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-[#b7cba6]">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  )}
                </div>
              </button>

              {/* Telegram Option */}
              <button
                onClick={startTelegramDeploy}
                disabled={!agentType || loading}
                className="w-full flex items-center gap-4 p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all text-left group disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden shrink-0">
                  <Image src={asset("/dashboard/integrations/icons/telegram.svg")} alt="Telegram" width={40} height={40} />
                </div>
                <div>
                  <div className="text-white/90 font-medium text-[14px]">Telegram</div>
                  <div className="text-white/40 text-[12px] mt-0.5">{loading ? 'Generating QR code…' : 'Deploy as a Telegram bot — scan a QR code'}</div>
                </div>
                <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-[#b7cba6]/30 border-t-[#b7cba6] rounded-full animate-spin" />
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-[#b7cba6]">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  )}
                </div>
              </button>

              {/* WhatsApp Option */}
              <button className="w-full flex items-center gap-4 p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all text-left group">
                <div className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden shrink-0">
                  <Image src={asset("/dashboard/integrations/icons/whatsapp.svg")} alt="WhatsApp" width={40} height={40} />
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
        )}

        {view === 'slack' && slackLink && (
          <>
            <button onClick={() => { stopPolling(); setView('channels'); }} className="flex items-center gap-1.5 text-white/40 hover:text-white text-[12px] transition-colors mb-4 -mt-2">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
              Back
            </button>

            <h3 style={{ fontSize: 20, fontWeight: 300, color: '#fff', margin: '0 0 8px', lineHeight: 1.3 }}>
              {linkStatus === 'connected' ? 'Agent connected' : 'Deploy to Slack'}
            </h3>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, margin: '0 0 24px' }}>
              {linkStatus === 'connected'
                ? <>Your <strong className="text-white font-medium">{slackLink.agent_name}</strong> is live in your Slack workspace. DM it or @mention it in a channel.</>
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
                      <Image src={asset("/dashboard/integrations/icons/slack.svg")} alt="Slack" width={28} height={28} />
                    </div>
                    {linkStatus === 'expired' ? (
                      <button
                        onClick={startSlackDeploy}
                        disabled={loading}
                        className="px-4 py-2 rounded-lg bg-[#242424] text-white text-[12px] font-medium border border-white/20 hover:border-[#b7cba6]/50 transition-all"
                      >
                        {loading ? 'Generating…' : 'Generate new link'}
                      </button>
                    ) : (
                      <span className="text-white/50 text-[12px] px-6 text-center">Waiting for Slack authorization…</span>
                    )}
                  </>
                )}
              </div>

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

              {linkStatus === 'connected' && (
                <button
                  onClick={onClose}
                  className="mt-5 w-full py-2.5 rounded-lg bg-[#b7cba6]/20 hover:bg-[#b7cba6]/30 text-[#dbe5d3] text-[13px] font-medium transition-all border border-[#b7cba6]/30"
                >
                  Done
                </button>
              )}
            </div>
          </>
        )}

        {view === 'telegram' && deployLink && (
          <>
            <button onClick={() => { stopPolling(); setView('channels'); }} className="flex items-center gap-1.5 text-white/40 hover:text-white text-[12px] transition-colors mb-4 -mt-2">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
              Back
            </button>

            <h3 style={{ fontSize: 20, fontWeight: 300, color: '#fff', margin: '0 0 8px', lineHeight: 1.3 }}>
              {linkStatus === 'connected' ? 'Agent connected' : `Deploy to Telegram`}
            </h3>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, margin: '0 0 24px' }}>
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
                        disabled={loading}
                        className="px-4 py-2 rounded-lg bg-[#242424] text-white text-[12px] font-medium border border-white/20 hover:border-[#b7cba6]/50 transition-all"
                      >
                        {loading ? 'Generating…' : 'Generate new QR'}
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

              {linkStatus === 'connected' && (
                <button
                  onClick={onClose}
                  className="mt-5 w-full py-2.5 rounded-lg bg-[#b7cba6]/20 hover:bg-[#b7cba6]/30 text-[#dbe5d3] text-[13px] font-medium transition-all border border-[#b7cba6]/30"
                >
                  Done
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DeploymentRow({ deployment, onDisconnect }: { deployment: AgentDeployment, onDisconnect: (d: AgentDeployment) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#b7cba6]/[0.05] border border-[#b7cba6]/[0.12]">
      <span className="w-1.5 h-1.5 rounded-full bg-[#b7cba6] shrink-0" />
      <Image
        src={asset(`/dashboard/integrations/icons/${deployment.kind}.svg`)}
        alt={deployment.kind}
        width={12}
        height={12}
        className="shrink-0"
      />
      <span className="text-[10.5px] text-white/65 truncate flex-1" title={deployment.label}>
        {deployment.label}
      </span>
      <button
        onClick={async () => {
          if (busy) return;
          if (!window.confirm(`Disconnect this agent from ${deployment.kind === 'telegram' ? 'Telegram chat' : 'Slack workspace'} "${deployment.label}"?`)) return;
          setBusy(true);
          try { await onDisconnect(deployment); } finally { setBusy(false); }
        }}
        title="Disconnect deployment"
        className="shrink-0 text-white/30 hover:text-red-400/90 transition-colors disabled:opacity-40"
        disabled={busy}
      >
        {busy ? (
          <span className="block w-3 h-3 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        )}
      </button>
    </div>
  );
}

function AgentCard({ agent, deployments, onDeploy, onDisconnect }: { agent: typeof AGENTS[0], deployments: AgentDeployment[], onDeploy: () => void, onDisconnect: (d: AgentDeployment) => void }) {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setMousePosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  return (
    <div 
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="bg-[#242424] rounded-xl flex flex-col h-full min-h-[240px] overflow-hidden relative shadow-[0_4px_16px_rgba(0,0,0,0.3)] border border-white/[0.06] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_10px_28px_rgba(0,0,0,0.4)] hover:border-white/[0.1] group"
    >
      {/* Spotlight Hover Effect */}
      <div 
        className="pointer-events-none absolute inset-0 z-50 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: `radial-gradient(500px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(255,255,255,0.06), transparent 40%)`
        }}
      />
      
      {/* Top Half: Grainy Noise Gradient Header */}
      <div className="relative h-[92px] shrink-0 flex flex-col items-start justify-start pt-4 px-5 gap-2" style={{ background: agent.gradient }}>
        <NoiseOverlay />
        <div className="relative z-10 w-full flex items-start justify-between">
          <div className="w-8 h-8 rounded-full bg-white/15 backdrop-blur-md ring-1 ring-white/20 shadow-md flex items-center justify-center text-white/95">
            {agent.icon}
          </div>
          {(agent as any).enterprise && (
            <span className="inline-flex items-center gap-1 px-2 py-[3px] rounded-full bg-black/30 backdrop-blur-md border border-[#e8b96a]/30 text-[#e8b96a] text-[9px] font-semibold uppercase tracking-[0.1em]">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-2.5 h-2.5 shrink-0">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
              Enterprise
            </span>
          )}
        </div>
        <div className="relative z-10 text-white font-medium text-[14px] leading-snug tracking-wide drop-shadow-sm" style={{ fontFamily: "'Manrope', sans-serif" }}>
          {agent.title}
        </div>
      </div>

      {/* Bottom Half: Content */}
      <div className="p-5 flex flex-col flex-1">
        <div className="text-white/70 text-[12px] leading-relaxed font-light" style={{ fontFamily: "'Manrope', sans-serif" }}>
          {agent.description}
        </div>

        {/* Tool capability chips */}
        {Array.isArray((agent as any).tools) && (agent as any).tools.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3.5">
            {(agent as any).tools.map((tool: string) => (
              <span
                key={tool}
                className="inline-flex items-center gap-1 px-2 py-[3px] rounded-full bg-white/[0.05] border border-white/[0.08] text-white/55 text-[10px] font-medium tracking-wide"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-2.5 h-2.5 text-[#b7cba6]/80">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085" />
                </svg>
                {tool}
              </span>
            ))}
            {Array.isArray((agent as any).enterpriseTools) && (agent as any).enterpriseTools.map((tool: string) => (
              <span
                key={tool}
                className="inline-flex items-center gap-1 px-2 py-[3px] rounded-full bg-[#e8b96a]/[0.06] border border-[#e8b96a]/[0.18] text-[#e8b96a]/85 text-[10px] font-medium tracking-wide"
                title="Enterprise plan only"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-2.5 h-2.5 shrink-0">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
                {tool}
              </span>
            ))}
          </div>
        )}

        {/* Live deployments (with disconnect) */}
        {deployments.length > 0 && (
          <div className="flex flex-col gap-1.5 mt-3.5">
            {deployments.map((d) => (
              <DeploymentRow key={`${d.kind}_${d.id}`} deployment={d} onDisconnect={onDisconnect} />
            ))}
          </div>
        )}

        <div className="mt-auto pt-5">
          <button
            onClick={onDeploy}
            className="w-full py-2 rounded-lg bg-gradient-to-b from-white/[0.09] to-white/[0.03] hover:from-[#b7cba6]/25 hover:to-[#b7cba6]/10 text-white/95 hover:text-white text-[12.5px] font-medium transition-all border border-white/10 hover:border-[#b7cba6]/30 shadow-[0_1px_0_rgba(255,255,255,0.08)_inset,0_4px_12px_rgba(0,0,0,0.25)] flex items-center justify-center gap-2 group/btn"
          >
            Deploy
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5 opacity-0 -translate-x-1 group-hover/btn:opacity-100 group-hover/btn:translate-x-0 transition-all duration-200">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

const ACTION_META: Record<string, { label: string; emoji: string }> = {
  lead: { label: 'Lead saved', emoji: '🎯' },
  ticket: { label: 'Ticket created', emoji: '🎫' },
  escalation: { label: 'Escalated to human', emoji: '🙋' },
  invoice: { label: 'Invoice recorded', emoji: '🧾' },
  anomaly: { label: 'Anomaly flagged', emoji: '🚩' },
  workflow: { label: 'Workflow triggered', emoji: '⚡' },
  integration: { label: 'Integration action', emoji: '🔗' },
  meeting: { label: 'Meeting summarized', emoji: '📝' },
};

const AGENT_TITLES: Record<string, string> = {
  autonomous: 'Autonomous Agent',
  customer_service: 'Customer Service Agent',
  leads_qualifier: 'Leads Qualifier Agent',
  finance_invoice_ops: 'Finance & Invoice Ops Agent',
  office_assistant: 'Office Assistant',
};

function actionSummary(action: AgentAction): string {
  const p = action.payload || {};
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = (p as Record<string, unknown>)[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return '';
  };
  switch (action.action_type) {
    case 'lead': {
      const who = [pick('name'), pick('company')].filter(Boolean).join(' — ');
      const status = pick('status');
      return [who, status && `(${status.replace(/_/g, ' ')})`].filter(Boolean).join(' ');
    }
    case 'ticket':
      return [pick('subject'), pick('priority') && `· ${pick('priority')}`].filter(Boolean).join(' ');
    case 'escalation':
      return pick('reason', 'summary');
    case 'invoice': {
      const amt = (p as Record<string, unknown>).amount;
      const amount = typeof amt === 'number' ? amt.toLocaleString() : '';
      return [pick('vendor'), amount && `· ${pick('currency') || ''} ${amount}`.trim()].filter(Boolean).join(' ');
    }
    case 'anomaly':
      return [pick('invoice_ref'), pick('anomaly_type') && `· ${pick('anomaly_type').replace(/_/g, ' ')}`].filter(Boolean).join(' ');
    case 'workflow':
      return pick('workflow').replace(/_/g, ' ');
    case 'meeting': {
      const decisions = Array.isArray((p as Record<string, unknown>).decisions) ? ((p as Record<string, unknown>).decisions as unknown[]).length : 0;
      const items = Array.isArray((p as Record<string, unknown>).action_items) ? ((p as Record<string, unknown>).action_items as unknown[]).length : 0;
      const counts = [decisions && `${decisions} decisions`, items && `${items} action items`].filter(Boolean).join(', ');
      return [pick('title'), counts && `· ${counts}`].filter(Boolean).join(' ');
    }
    case 'integration':
      return pick('tool').replace(/_/g, ' ').toLowerCase();
    default:
      return '';
  }
}

function timeAgo(iso: string): string {
  const then = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.max(0, Math.floor((Date.now() - then) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function AgentActivity() {
  const [actions, setActions] = useState<AgentAction[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    listAgentActions(20)
      .then(setActions)
      .catch(() => setFailed(true));
  }, []);

  if (failed) return null; // quietly hide the feed if the log isn't reachable

  return (
    <div className="mt-10">
      <div className="flex items-center gap-2.5 mb-4">
        <h3 style={{ fontSize: 16, fontWeight: 400, color: '#fff', margin: 0 }}>Agent Activity</h3>
        <span className="text-white/35 text-[11px]">actions your deployed agents took</span>
      </div>

      <div className="rounded-xl bg-white/[0.025] border border-white/[0.06] divide-y divide-white/[0.05]">
        {actions === null ? (
          <div className="px-5 py-6 text-white/40 text-[12px]">Loading activity…</div>
        ) : actions.length === 0 ? (
          <div className="px-5 py-6 text-white/40 text-[12px]">
            No activity yet. Once a deployed agent saves a lead, opens a ticket, records an invoice, or runs a workflow, it will show up here.
          </div>
        ) : (
          actions.map((a) => {
            const meta = ACTION_META[a.action_type] || { label: a.action_type, emoji: '•' };
            const summary = actionSummary(a);
            return (
              <div key={a.action_id} className="flex items-center gap-3.5 px-5 py-3">
                <span className="text-[15px] leading-none shrink-0">{meta.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-white/85 text-[12.5px] font-medium truncate">
                    {meta.label}
                    {summary && <span className="text-white/55 font-normal"> — {summary}</span>}
                  </div>
                  <div className="text-white/35 text-[11px] mt-0.5">
                    {AGENT_TITLES[a.agent_type] || a.agent_type}
                    {a.channel ? ` · via ${a.channel}` : ''}
                  </div>
                </div>
                <span className="text-white/30 text-[11px] shrink-0">{timeAgo(a.created_at)}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default function AgentsPage() {
  const [deployingAgent, setDeployingAgent] = useState<{ title: string, agentType: TelegramAgentType | null } | null>(null);
  const [dynamicAgents, setDynamicAgents] = useState<any[]>([]);
  const [deployments, setDeployments] = useState<AgentDeployment[]>([]);

  const refreshDeployments = useCallback(() => {
    listDeployments().then(setDeployments).catch(() => {});
  }, []);
  useEffect(() => { refreshDeployments(); }, [refreshDeployments]);

  const handleDisconnect = useCallback(async (d: AgentDeployment) => {
    try {
      await deleteDeployment(d);
      setDeployments(prev => prev.filter(x => !(x.kind === d.kind && x.id === d.id)));
    } catch {
      // refetch to resync if the delete failed server-side
      refreshDeployments();
    }
  }, [refreshDeployments]);
  useEffect(() => {
    fetch('/dashboard/api/agent-catalog')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (!Array.isArray(data)) return;
        const grads = Object.values(AGENT_GRADIENTS);
        setDynamicAgents(
          data.map((a: any, i: number) => ({
            title: a.name,
            description: a.description || '',
            gradient: grads[i % grads.length],
            icon: AGENTS[0].icon,
          }))
        );
      })
      .catch(() => {});
  }, []);
  const allAgents = [...AGENTS, ...dynamicAgents];

  return (
    <div className="min-h-screen bg-[#353531] text-white p-8 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
      <div className="max-w-6xl mx-auto overflow-x-hidden pb-20">
        
        {/* Header Title */}
        <div className="flex items-center justify-between mb-6">
          <div className="text-[13px] font-light text-[#a1a1aa] flex items-center gap-2">
            <span className="text-white">Agent</span>
          </div>
        </div>

        {/* Hero Banner */}
        <HeroBanner />

        {/* Integrations Row */}
        <IntegrationsRow />

        {/* 4-Column Grid for Agent Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 w-full">
          {allAgents.map((agent, idx) => (
            <AgentCard
              key={idx}
              agent={agent}
              deployments={deployments.filter((d) => d.agentType === (agent as any).agentType)}
              onDeploy={() => setDeployingAgent({ title: agent.title, agentType: (agent as any).agentType ?? null })}
              onDisconnect={handleDisconnect}
            />
          ))}
        </div>

        {/* Recent actions taken by deployed agents */}
        <AgentActivity />

      </div>

      {/* Deploy Modal */}
      <DeployModal
        isOpen={!!deployingAgent}
        onClose={() => { setDeployingAgent(null); refreshDeployments(); }}
        agentName={deployingAgent?.title ?? null}
        agentType={deployingAgent?.agentType ?? null}
      />
    </div>
  );
}
