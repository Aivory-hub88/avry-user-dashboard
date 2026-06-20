'use client';
import { asset } from "@/lib/asset";

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';

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
};

const AGENTS = [
  {
    title: 'Autonomous Agent',
    description: 'Deploy autonomous agents inside your communication hubs. They triage, respond, and update your CRM 24/7.',
    gradient: AGENT_GRADIENTS.autonomous,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
      </svg>
    )
  },
  {
    title: 'Customer Service Agent',
    description: 'Handle inbound support 24/7. Automatically triage, resolve, and escalate to a human if necessary.',
    gradient: AGENT_GRADIENTS.service,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z" />
      </svg>
    )
  },
  {
    title: 'Leads Qualifier Agent',
    description: 'Filter inbound leads using the BANT framework. Qualified leads are automatically routed to sales.',
    gradient: AGENT_GRADIENTS.leads,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
      </svg>
    )
  },
  {
    title: 'Finance & Invoice Ops Agent',
    description: 'Automate invoice processing, anomaly detection, and multi-tier approval routing - end to end.',
    gradient: AGENT_GRADIENTS.finance,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    )
  }
];

function DeployModal({ isOpen, onClose, agentName }: { isOpen: boolean, onClose: () => void, agentName: string | null }) {
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

        <h3 className="text-xl text-white font-light mb-2">Deploy Agent</h3>
        <p className="text-white/60 text-[13px] leading-relaxed mb-8">Select a communication channel to connect your <strong className="text-white font-medium">{agentName}</strong>.</p>

        <div className="space-y-3">
          {/* Slack Option */}
          <button className="w-full flex items-center gap-4 p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all text-left group">
            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center overflow-hidden shrink-0">
              <Image src={asset("/integrations/icons/slack.svg")} alt="Slack" width={20} height={20} />
            </div>
            <div>
              <div className="text-white/90 font-medium text-[14px]">Slack</div>
              <div className="text-white/40 text-[12px] mt-0.5">Connect to a Slack workspace</div>
            </div>
            <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-[#b7cba6]">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </div>
          </button>

          {/* Telegram Option */}
          <button className="w-full flex items-center gap-4 p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all text-left group">
            <div className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden shrink-0">
              <Image src={asset("/integrations/icons/telegram.svg")} alt="Telegram" width={40} height={40} />
            </div>
            <div>
              <div className="text-white/90 font-medium text-[14px]">Telegram</div>
              <div className="text-white/40 text-[12px] mt-0.5">Deploy as a Telegram bot</div>
            </div>
            <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-[#b7cba6]">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </div>
          </button>

          {/* WhatsApp Option */}
          <button className="w-full flex items-center gap-4 p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all text-left group">
            <div className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden shrink-0">
              <Image src={asset("/integrations/icons/whatsapp.svg")} alt="WhatsApp" width={40} height={40} />
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
      </div>
    </div>
  );
}

function AgentCard({ agent, onDeploy }: { agent: typeof AGENTS[0], onDeploy: () => void }) {
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
      className="bg-[#242424] rounded-2xl flex flex-col h-full min-h-[320px] overflow-hidden relative shadow-lg border border-transparent transition-transform hover:-translate-y-1 group"
    >
      {/* Spotlight Hover Effect */}
      <div 
        className="pointer-events-none absolute inset-0 z-50 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: `radial-gradient(500px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(255,255,255,0.06), transparent 40%)`
        }}
      />
      
      {/* Top Half: Grainy Noise Gradient Header */}
      <div className="relative h-[140px] shrink-0 flex flex-col items-start justify-start pt-7 px-7 gap-2.5" style={{ background: agent.gradient }}>
        <NoiseOverlay />
        <div className="relative z-10 text-white/95">
          {agent.icon}
        </div>
        <div className="relative z-10 text-white font-light text-[17px] lg:text-[19px] leading-snug tracking-wide" style={{ fontFamily: "'Manrope', sans-serif" }}>
          {agent.title}
        </div>
      </div>
      
      {/* Bottom Half: Content */}
      <div className="p-7 flex flex-col flex-1">
        <div className="text-white/75 text-[13px] leading-relaxed font-light" style={{ fontFamily: "'Manrope', sans-serif" }}>
          {agent.description}
        </div>

        <div className="mt-auto pt-7">
          <button 
            onClick={onDeploy}
            className="w-full py-2.5 rounded-lg bg-[#51544a] hover:bg-[#606359] text-white/95 text-[13.5px] font-medium transition-colors border border-white/5 shadow-inner"
          >
            Deploy
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AgentsPage() {
  const [deployingAgent, setDeployingAgent] = useState<string | null>(null);
  const [dynamicAgents, setDynamicAgents] = useState<any[]>([]);
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
        <div className="bg-[#51544a] rounded-[28px] p-12 md:p-16 mb-12 shadow-lg relative overflow-hidden">
          <div className="relative z-10">
            <h2 className="text-3xl md:text-[38px] font-light text-white mb-8 tracking-tight">
              Meet your team where they already work
            </h2>
            <p className="text-white/70 text-[17px] font-light max-w-xl leading-relaxed">
              Deploy any Aivory agent directly to your communication channels<br className="hidden md:block"/>
              no extra apps, no friction.
            </p>
          </div>
          {/* Decorative background circle */}
          <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-white/5 rounded-full blur-3xl" />
        </div>

        {/* Integrations Row */}
        <div className="flex flex-col md:flex-row items-start md:items-center gap-12 md:gap-24 mb-16 px-4">
          {/* Standard Integrations */}
          <div className="flex flex-col items-start gap-4">
            <div className="flex items-center gap-5">
              <div className="w-11 h-11 rounded-full bg-white flex items-center justify-center shadow-lg hover:scale-105 transition-transform cursor-pointer overflow-hidden">
                <Image src={asset("/integrations/icons/slack.svg")} alt="Slack" width={22} height={22} />
              </div>
              <div className="w-11 h-11 rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-transform cursor-pointer overflow-hidden">
                <Image src={asset("/integrations/icons/telegram.svg")} alt="Telegram" width={44} height={44} />
              </div>
            </div>
            <span className="text-white/40 text-[11px] uppercase tracking-wider font-medium">Available for all tier</span>
          </div>

          {/* Enterprise Integrations */}
          <div className="flex flex-col items-start gap-4">
            <div className="w-11 h-11 rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-transform cursor-pointer overflow-hidden">
              <Image src={asset("/integrations/icons/whatsapp.svg")} alt="WhatsApp" width={44} height={44} />
            </div>
            <span className="text-white/40 text-[11px] uppercase tracking-wider font-medium">Available on Enterprise plan only</span>
          </div>
        </div>

        {/* 4-Column Grid for Agent Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 w-full">
          {allAgents.map((agent, idx) => (
            <AgentCard key={idx} agent={agent} onDeploy={() => setDeployingAgent(agent.title)} />
          ))}
        </div>

      </div>

      {/* Deploy Modal */}
      <DeployModal 
        isOpen={!!deployingAgent} 
        onClose={() => setDeployingAgent(null)} 
        agentName={deployingAgent} 
      />
    </div>
  );
}
