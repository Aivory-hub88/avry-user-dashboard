'use client'

import { AuthManager } from '@/lib/authManager'
import { usePayment } from '@/hooks/usePayment'

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
    <div>
      {paymentError && (
        <div className="mb-6 rounded-lg bg-red-500/[0.1] border border-red-500/[0.3] p-4">
          <p className="text-sm text-red-300">{paymentError}</p>
        </div>
      )}

      <h3 className="text-lg font-medium text-white mb-2">Activate Features</h3>
      <p className="text-sm text-gray-400 mb-6">One-time purchases to unlock premium features and enable specific tabs</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* AI Readiness Deep Diagnostic */}
        <div className={`rounded-lg border p-6 transition-all flex flex-col ${hasDiagnostic ? 'border-[#b7cba6] bg-white/[0.03]' : 'border-white/[0.07] bg-white/[0.01] hover:border-white/[0.1]'}`}>
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-lg font-medium text-white">AI Readiness Deep Diagnostic</h3>
            {hasDiagnostic && <span className="text-xs font-medium px-2 py-1 bg-[#b7cba6] text-black rounded">Active</span>}
          </div>
          <p className="text-sm text-gray-400 mb-4">Know exactly where your business stands on AI before you build anything.</p>
          <div className="mb-6">
            <span className="text-3xl font-bold text-white">$29</span>
            <span className="text-sm text-gray-400">/one time</span>
          </div>
          <ul className="space-y-2 text-sm text-gray-300 mb-6 flex-grow">
            <li>✓ AI readiness score</li>
            <li>✓ Business objective mapping</li>
            <li>✓ Gap & constraint analysis</li>
            <li>✓ AI opportunity identification</li>
            <li>✓ Data & process readiness</li>
          </ul>
          <button
            className={`w-full py-3 rounded-lg font-medium transition-colors mt-auto ${hasDiagnostic ? 'bg-white/[0.05] text-gray-400 cursor-default' : paymentLoading ? 'bg-white/[0.1] text-white/60' : 'bg-[#b7cba6] text-black hover:bg-[#00d489]'}`}
            onClick={() => !hasDiagnostic && handlePayment('ai_diagnostic', 29, 'AI Readiness Deep Diagnostic')}
            disabled={paymentLoading || hasDiagnostic}
          >
            {paymentLoading ? 'Processing...' : hasDiagnostic ? 'Tab Unlocked' : 'Activate'}
          </button>
        </div>

        {/* AI System Blueprint + Roadmap */}
        <div className={`rounded-lg border p-6 transition-all flex flex-col ${hasBlueprint ? 'border-[#b7cba6] bg-white/[0.03]' : 'border-white/[0.07] bg-white/[0.01] hover:border-white/[0.1]'}`}>
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-lg font-medium text-white">AI System Blueprint + Roadmap</h3>
            {hasBlueprint && <span className="text-xs font-medium px-2 py-1 bg-[#b7cba6] text-black rounded">Active</span>}
          </div>
          <p className="text-sm text-gray-400 mb-4">Your full AI architecture and execution plan, built around your business, not a template.</p>
          <div className="mb-6">
            <span className="text-3xl font-bold text-white">$85</span>
            <span className="text-sm text-gray-400">/one time</span>
          </div>
          <ul className="space-y-2 text-sm text-gray-300 mb-6 flex-grow">
            <li>✓ Full AI system blueprint</li>
            <li>✓ Workflow architecture</li>
            <li>✓ Agent structure design</li>
            <li>✓ Deployment-ready plan</li>
            <li>✓ Phased implementation roadmap</li>
            <li>✓ KPI targets per phase</li>
          </ul>
          <button
            className={`w-full py-3 rounded-lg font-medium transition-colors mt-auto ${hasBlueprint ? 'bg-white/[0.05] text-gray-400 cursor-default' : paymentLoading ? 'bg-white/[0.1] text-white/60' : 'bg-[#b7cba6] text-black hover:bg-[#00d489]'}`}
            onClick={() => !hasBlueprint && handlePayment('ai_blueprint', 85, 'AI System Blueprint + Roadmap')}
            disabled={paymentLoading || hasBlueprint}
          >
            {paymentLoading ? 'Processing...' : hasBlueprint ? 'Tab Unlocked' : 'Activate'}
          </button>
        </div>

        {/* Full Stack Bundle */}
        <div className={`rounded-lg border p-6 transition-all flex flex-col ${hasFullStack ? 'border-[#b7cba6] bg-white/[0.03]' : 'border-white/[0.07] bg-white/[0.01] hover:border-white/[0.1]'}`}>
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-lg font-medium text-white">Full Stack Bundle</h3>
            {hasFullStack && <span className="text-xs font-medium px-2 py-1 bg-[#b7cba6] text-black rounded">Active</span>}
          </div>
          <p className="text-sm text-gray-400 mb-4">Everything in one. Know, plan, execute in order.</p>
          <div className="mb-6">
            <span className="text-3xl font-bold text-white">$99</span>
            <span className="text-sm text-gray-400">/one time</span>
          </div>
          <ul className="space-y-2 text-sm text-gray-300 mb-6 flex-grow">
            <li>✓ Deep Diagnostic</li>
            <li>✓ Blueprint</li>
            <li>✓ Roadmap</li>
            <li className="text-[#b7cba6] font-medium">✓ Save $15 vs buying separately</li>
          </ul>
          <button
            className={`w-full py-3 rounded-lg font-medium transition-colors mt-auto ${hasFullStack ? 'bg-white/[0.05] text-gray-400 cursor-default' : paymentLoading ? 'bg-white/[0.1] text-white/60' : 'bg-[#b7cba6] text-black hover:bg-[#00d489]'}`}
            onClick={() => !hasFullStack && handlePayment('ai_fullstack', 99, 'Full Stack Bundle')}
            disabled={paymentLoading || hasFullStack}
          >
            {paymentLoading ? 'Processing...' : hasFullStack ? 'All Tabs Unlocked' : 'Activate Bundle'}
          </button>
        </div>
      </div>
    </div>
  )
}
