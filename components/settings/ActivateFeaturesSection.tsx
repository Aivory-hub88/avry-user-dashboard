'use client'

import { AuthManager } from '@/lib/authManager'
import { usePayment } from '@/hooks/usePayment'
import { useState, useRef } from 'react'

function PricingCard({
  title,
  subtitle,
  description,
  price,
  frequency,
  features,
  savings,
  isActive,
  isLoading,
  onActivate,
  activeText = 'Tab Unlocked',
  actionText = 'Activate',
  highlight = false
}: any) {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
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
      className={`bg-[#242424] rounded-2xl flex flex-col h-full overflow-hidden relative shadow-[0_4px_16px_rgba(0,0,0,0.3)] border transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_10px_28px_rgba(0,0,0,0.4)] group ${
        isActive 
          ? 'border-[#b7cba6]/50' 
          : highlight 
            ? 'border-[#b7cba6]/30 hover:border-[#b7cba6]/50' 
            : 'border-white/[0.06] hover:border-white/[0.15]'
      }`}
    >
      {/* Spotlight Hover Effect */}
      {!isActive && (
        <div 
          className="pointer-events-none absolute inset-0 z-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background: `radial-gradient(600px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(255,255,255,0.04), transparent 40%)`
          }}
        />
      )}
      
      {/* Active Indicator Glow */}
      {isActive && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#b7cba6] to-transparent opacity-70" />
      )}

      <div className="p-8 flex flex-col flex-1 relative z-10">
        {/* Header */}
        <div className="min-h-[100px] mb-2">
          <div className="flex justify-between items-start mb-4 h-6">
            {highlight && !isActive && (
              <span className="inline-flex items-center px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#b7cba6] bg-[#b7cba6]/10 border border-[#b7cba6]/20 rounded-full">
                Most Popular
              </span>
            )}
            {isActive && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#242424] bg-[#b7cba6] rounded-full">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Active
              </span>
            )}
          </div>
          <h3 className="text-[22px] lg:text-[24px] font-normal leading-tight text-white whitespace-pre-line mb-1">
            {title}
          </h3>
          {subtitle && (
            <p className="text-[13px] font-medium text-[#b7cba6] mt-2">
              {subtitle}
            </p>
          )}
        </div>

        {/* Price */}
        <div className="flex items-end justify-start gap-3 py-4 mb-2">
          <span className="text-[42px] font-bold leading-none text-white tracking-tight">
            ${price}
          </span>
          <div className="flex flex-col pb-1">
            <span className="text-[14px] font-medium text-gray-400 mb-1.5">
              {frequency}
            </span>
            <div className={`w-full h-[3px] rounded-full ${isActive ? 'bg-[#b7cba6]' : highlight ? 'bg-[#b7cba6]/50' : 'bg-white/10'}`} />
          </div>
        </div>

        {/* Description */}
        <p className="text-[14px] leading-relaxed text-gray-400 mb-8 min-h-[60px]">
          {description}
        </p>

        {/* Features */}
        <ul className="space-y-3.5 mb-8 flex-1">
          {features.map((f: string, i: number) => (
            <li key={i} className="flex items-start gap-3 text-[14px] text-gray-300">
              <svg className={`w-5 h-5 shrink-0 mt-0.5 ${isActive ? 'text-[#b7cba6]' : 'text-gray-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span className="leading-snug">{f}</span>
            </li>
          ))}
        </ul>

        {/* Savings */}
        {savings && (
          <div className="mb-6 inline-flex items-center justify-center bg-[#b7cba6]/10 border border-[#b7cba6]/20 px-4 py-2 rounded-lg text-[13px] font-semibold text-[#b7cba6]">
            {savings}
          </div>
        )}

        {/* CTA Button */}
        <div className="pt-2 mt-auto">
          <button
            onClick={onActivate}
            disabled={isLoading || isActive}
            className={`w-full py-3 rounded-xl text-[14px] font-medium transition-all flex items-center justify-center gap-2 group/btn ${
              isActive
                ? 'bg-white/[0.03] text-gray-500 border border-white/[0.05] shadow-none cursor-default'
                : isLoading
                ? 'bg-white/[0.05] text-white/50 border border-white/10 cursor-wait'
                : highlight
                ? 'bg-[#b7cba6] text-[#242424] hover:bg-[#cde4bc] border border-[#b7cba6] shadow-[0_0_20px_rgba(183,203,166,0.2)]'
                : 'bg-gradient-to-b from-white/[0.09] to-white/[0.03] hover:from-[#b7cba6]/25 hover:to-[#b7cba6]/10 text-white/95 hover:text-white border border-white/10 hover:border-[#b7cba6]/30 shadow-[0_1px_0_rgba(255,255,255,0.08)_inset,0_4px_12px_rgba(0,0,0,0.25)]'
            }`}
          >
            {isLoading ? (
              <>
                <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Processing...
              </>
            ) : isActive ? (
              activeText
            ) : (
              <>
                {actionText}
                {!isActive && !isLoading && (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-4 h-4 opacity-0 -translate-x-1 group-hover/btn:opacity-100 group-hover/btn:translate-x-0 transition-all duration-200 ${highlight ? 'text-[#242424]' : 'text-[#b7cba6]'}`}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3" />
                  </svg>
                )}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * One-time feature purchases (Deep Diagnostic / Blueprint+Roadmap / Full
 * Stack Bundle) — pricing and copy mirror the landing page's pricing cards
 * (frontend-nextjs components/home/PricingStepOne.tsx). Rendered both on
 * the dashboard's Subscriptions tab and inside the account Settings modal.
 */
export function ActivateFeaturesSection() {
  const { handlePayment, paymentLoading, paymentError } = usePayment()
  const user = AuthManager.getUser()
  const hasDiagnostic = Boolean(user?.has_diagnostic)
  const hasBlueprint = Boolean(user?.has_blueprint)
  const hasFullStack = hasDiagnostic && hasBlueprint

  return (
    <div className="py-2">
      {paymentError && (
        <div className="mb-8 rounded-xl bg-red-500/[0.1] border border-red-500/[0.3] p-4 flex items-center gap-3">
          <svg className="w-5 h-5 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-sm text-red-300 font-medium">{paymentError}</p>
        </div>
      )}

      <div className="mb-10">
        <h3 className="text-[24px] font-medium text-white mb-3">Activate Features</h3>
        <p className="text-[15px] text-gray-400 max-w-2xl leading-relaxed">
          Unlock premium features and enable specific tabs. Choose a single product or get the bundle for the complete experience.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 lg:gap-8 items-stretch">
        <PricingCard
          title="AI Readiness Deep Diagnostic"
          price={29}
          frequency="/ one time"
          description="Know exactly where your business stands on AI before you build anything."
          features={[
            'AI readiness score',
            'Business objective mapping',
            'Gap & constraint analysis',
            'AI opportunity identification',
            'Data & process readiness'
          ]}
          isActive={hasDiagnostic}
          isLoading={paymentLoading}
          onActivate={() => handlePayment('ai_diagnostic', 29, 'AI Readiness Deep Diagnostic')}
        />

        <PricingCard
          title="AI System Blueprint + Roadmap"
          price={85}
          frequency="/ one time"
          description="Your full AI architecture and execution plan, built around your business, not a template."
          features={[
            'Full AI system blueprint',
            'Workflow architecture',
            'Agent structure design',
            'Deployment-ready plan',
            'Phased implementation roadmap',
            'KPI targets per phase'
          ]}
          isActive={hasBlueprint}
          isLoading={paymentLoading}
          onActivate={() => handlePayment('ai_blueprint', 85, 'AI System Blueprint + Roadmap')}
        />

        <PricingCard
          title="Full Stack Bundle"
          subtitle="Deep Diagnostic + Blueprint + Roadmap"
          price={99}
          frequency="/ one time"
          description="Everything in one. Know, plan, execute in order."
          features={[
            'Deep Diagnostic',
            'Blueprint',
            'Roadmap'
          ]}
          savings="Save $15 vs buying separately"
          isActive={hasFullStack}
          isLoading={paymentLoading}
          onActivate={() => handlePayment('ai_fullstack', 99, 'Full Stack Bundle')}
          activeText="All Tabs Unlocked"
          actionText="Activate Bundle"
          highlight={!hasFullStack}
        />
      </div>
    </div>
  )
}
