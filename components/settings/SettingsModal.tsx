'use client'

import { useState, useEffect } from 'react'
import { logout } from '@/lib/auth'
import { getMarketingUrl } from '@/lib/config'
import { useSettingsModal, SettingsTab } from '@/contexts/SettingsModalContext'
import { ActivateFeaturesSection } from '@/components/settings/ActivateFeaturesSection'

export interface User {
  user_id: string
  email: string
  account_type: string
}

interface SettingsModalProps {
  user: User | null
}

type TabType = SettingsTab

export function SettingsModal({ user }: SettingsModalProps) {
  const { isOpen, activeTab, openSettingsModal, closeSettingsModal } = useSettingsModal()
  const setActiveTab = (tab: TabType) => openSettingsModal(tab)
  const onClose = closeSettingsModal

  // Local Settings State
  const [autoRefill, setAutoRefill] = useState(true)
  const [useSearchHistory, setUseSearchHistory] = useState(true)
  const [useNotes, setUseNotes] = useState(true)
  
  // Credits State
  const [isAddingCredits, setIsAddingCredits] = useState(false)
  const creditPackages = [
    { amount: 50, price: 5 },
    { amount: 100, price: 9 },
    { amount: 250, price: 20 },
    { amount: 500, price: 38 },
    { amount: 1000, price: 70 },
    { amount: 2500, price: 165 },
    { amount: 5000, price: 300, popular: true },
    { amount: 10000, price: 550 },
  ]

  useEffect(() => {
    // Load local settings
    const storedRefill = localStorage.getItem('settings_autorefill')
    const storedHistory = localStorage.getItem('settings_searchhistory')
    const storedNotes = localStorage.getItem('settings_notes')

    if (storedRefill !== null) setAutoRefill(storedRefill === 'true')
    if (storedHistory !== null) setUseSearchHistory(storedHistory === 'true')
    if (storedNotes !== null) setUseNotes(storedNotes === 'true')
  }, [])

  const handleToggle = (key: string, value: boolean, setter: React.Dispatch<React.SetStateAction<boolean>>) => {
    setter(value)
    localStorage.setItem(`settings_${key}`, String(value))
  }

  const handleLogout = async () => {
    try {
      await logout()
      if (typeof window !== 'undefined') {
        window.location.href = getMarketingUrl()
      }
    } catch (error) {
      console.error('[SettingsModal] Logout failed:', error)
      alert('Failed to logout. Please try again.')
    }
  }

  if (!isOpen) return null

  // Helper variables for UI
  const displayEmail = user?.email || 'loading...'
  const displayUsername = user?.email?.split('@')[0] || 'User'
  const displayTier = user?.account_type === 'superadmin' ? 'Admin' : 'Pro'

  const sidebarSections = [
    {
      title: 'Account',
      items: [
        { id: 'account', label: 'Account', icon: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></> },
        { id: 'memory', label: 'Memory', icon: <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></> },
        { id: 'notifications', label: 'Notifications', icon: <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></> },
        { id: 'usage', label: 'Usage and credits', icon: <><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></> },
        { id: 'purchases', label: 'Activate Features', icon: <><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></> },
      ]
    },
    {
      title: 'Other',
      items: [
        { id: 'upgrade', label: 'Upgrade to Enterprise', icon: <><path d="M21.5 12H16c-.7 2-2 3-4 3s-3.3-1-4-3H2.5"/><path d="M5.5 5.1L2 12v6c0 1.1.9 2 2 2h16a2 2 0 002-2v-6l-3.4-6.9A2 2 0 0016.8 4H7.2a2 2 0 00-1.8 1.1z"/></> },
        { id: 'about', label: 'API Platform', icon: <><rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></> },
      ]
    }
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-[90vw] max-w-[1100px] h-[85vh] max-h-[800px] bg-[#1e1e1e] rounded-2xl border border-white/10 flex overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 relative"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-5 right-5 w-8 h-8 rounded-full bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 flex items-center justify-center z-10 transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        {/* Sidebar */}
        <div className="w-[250px] bg-[#181818] border-r border-white/5 flex flex-col p-4 overflow-y-auto">
          {sidebarSections.map((section, idx) => (
            <div key={idx} className="mb-6">
              <div className="text-xs font-medium text-white/40 mb-3 px-3">
                {section.title}
              </div>
              <div className="space-y-1">
                {section.items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id as TabType)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      activeTab === item.id 
                        ? 'bg-white/10 text-white' 
                        : 'text-white/60 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      {item.icon}
                    </svg>
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Main Content Area */}
        <div className="flex-1 bg-[#1e1e1e] p-8 md:p-12 overflow-y-auto relative text-white">
          
          {/* TAB: ACCOUNT */}
          {activeTab === 'account' && (
            <div className="animate-in slide-in-from-bottom-2 fade-in duration-300">
              <h2 className="text-2xl font-semibold mb-8 pb-4 border-b border-white/5">Account</h2>
              
              <div className="mb-10">
                <div className="flex items-center justify-between py-4 border-b border-white/5">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-[#333338] flex items-center justify-center text-white/60">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                    </div>
                    <div>
                      <p className="text-[13px] text-white/60">{displayEmail}</p>
                    </div>
                  </div>
                  <button className="px-4 py-2 text-[13px] font-medium border border-white/10 rounded-md hover:bg-white/5 transition-colors">Change avatar</button>
                </div>
                
                <div className="flex items-center justify-between py-4 border-b border-white/5">
                  <div>
                    <h4 className="text-sm font-medium mb-1">Full Name</h4>
                  </div>
                  <button className="px-4 py-2 text-[13px] font-medium border border-white/10 rounded-md hover:bg-white/5 transition-colors">Change full name</button>
                </div>
                
                <div className="flex items-center justify-between py-4 border-b border-white/5">
                  <div>
                    <h4 className="text-sm font-medium mb-1">Username</h4>
                    <p className="text-[13px] text-white/60">{displayUsername}</p>
                  </div>
                  <button className="px-4 py-2 text-[13px] font-medium border border-white/10 rounded-md hover:bg-white/5 transition-colors">Change username</button>
                </div>
              </div>

              {/* Subscription Card */}
              <div className="mb-10">
                <h3 className="text-base font-semibold mb-4">Your Subscription</h3>
                
                <div className="bg-white/5 border border-white/10 rounded-xl p-5 flex items-center justify-between mb-6">
                  <div>
                    <h4 className="text-sm font-medium flex items-center mb-1">
                      Thanks for subscribing to Aivory <span className="ml-2 px-2 py-0.5 rounded bg-[#b7cba6]/10 text-[#b7cba6] text-[11px] font-bold uppercase">{displayTier}</span>
                    </h4>
                    <p className="text-[13px] text-white/60">Explore your new Pro features. <a href="#" className="underline hover:text-white">Learn more</a></p>
                  </div>
                  <div className="flex gap-3">
                    <button className="px-4 py-2 text-[13px] font-medium border border-white/10 rounded-md hover:bg-white/5 transition-colors">Manage</button>
                    <button className="px-4 py-2 text-[13px] font-medium bg-white text-black rounded-md hover:bg-white/90 transition-colors">Upgrade plan</button>
                  </div>
                </div>
              </div>

              {/* System Actions */}
              <div>
                <h3 className="text-base font-semibold mb-4">System</h3>
                
                <div className="flex items-center justify-between py-4 border-b border-white/5">
                  <div><h4 className="text-sm font-medium">Support</h4></div>
                  <button className="px-4 py-2 text-[13px] font-medium border border-white/10 rounded-md hover:bg-white/5 transition-colors">Contact</button>
                </div>
                
                <div className="flex items-center justify-between py-4 border-b border-white/5">
                  <div><h4 className="text-sm font-medium">You are signed in as {displayUsername}</h4></div>
                  <button onClick={handleLogout} className="px-4 py-2 text-[13px] font-medium border border-white/10 rounded-md hover:bg-white/5 transition-colors text-red-400 hover:text-red-300">Sign out</button>
                </div>
              </div>
            </div>
          )}

          {/* TAB: USAGE AND CREDITS */}
          {activeTab === 'usage' && (
            <div className="animate-in slide-in-from-bottom-2 fade-in duration-300">
              <h2 className="text-2xl font-semibold mb-8 pb-4 border-b border-white/5">
                Available usage-based credits
                <span className="block mt-1 text-[13px] font-normal text-white/60">Learn more about how credits work.</span>
              </h2>
              
              <div className="bg-white/5 border border-white/10 rounded-xl p-5 flex items-center justify-between mb-8">
                <div>
                  <p className="text-[13px] text-white/60 mb-1">Available credits</p>
                  <h3 className="text-3xl font-medium">0</h3>
                </div>
                <button 
                  onClick={() => setIsAddingCredits(!isAddingCredits)}
                  className="px-4 py-2 text-[13px] font-medium bg-white text-black rounded-md hover:bg-white/90 transition-colors"
                >
                  {isAddingCredits ? 'Cancel' : 'Add credits'}
                </button>
              </div>

              {isAddingCredits && (
                <div className="mb-10 animate-in slide-in-from-top-2 fade-in duration-300">
                  <h3 className="text-base font-semibold mb-4">Intelligence Credit Marketplace</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {creditPackages.map((pkg) => (
                      <button 
                        key={pkg.amount}
                        onClick={() => {
                          alert(`Purchasing ${pkg.amount} IC for $${pkg.price}. Payment integration coming soon!`)
                          setIsAddingCredits(false)
                        }}
                        className={`relative flex flex-col items-center justify-center p-5 rounded-xl border transition-all text-center group ${
                          pkg.popular 
                            ? 'bg-[#b7cba6]/5 border-[#b7cba6]/30 hover:border-[#b7cba6]/60 hover:bg-[#b7cba6]/10' 
                            : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
                        }`}
                      >
                        {pkg.popular && (
                          <span className="absolute -top-2.5 bg-[#b7cba6] text-[#1a0b2e] text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                            Most Popular
                          </span>
                        )}
                        <span className="text-xl font-bold mb-1 group-hover:scale-105 transition-transform">{pkg.amount.toLocaleString()} IC</span>
                        <span className="text-sm text-white/50">${pkg.price}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="mb-10">
                <h3 className="text-base font-semibold mb-4">Manage usage-based credits</h3>
                
                <div className="flex items-center justify-between py-5 border-b border-white/5">
                  <div>
                    <h4 className="text-sm font-medium mb-1">Auto-refill</h4>
                    <p className="text-[13px] text-white/60">When credits are below 500, auto-refill purchased credits</p>
                  </div>
                  <Toggle checked={autoRefill} onChange={(val) => handleToggle('autorefill', val, setAutoRefill)} />
                </div>
              </div>

              <div>
                <h3 className="text-base font-semibold mb-2">Credit usage</h3>
                <p className="text-[13px] text-white/60 mb-6">Manage and view your past invoices <a href="#" className="text-white underline">here</a></p>
                
                <div className="grid grid-cols-4 gap-4">
                  {[
                    { label: 'Text usage', val: '0.00' },
                    { label: 'Image usage', val: '0.00' },
                    { label: 'Video usage', val: '0.00' },
                    { label: 'Audio usage', val: '0.00' },
                  ].map(stat => (
                    <div key={stat.label} className="bg-white/5 border border-white/10 rounded-lg p-4">
                      <div className="text-[13px] text-white/60 mb-3">{stat.label}</div>
                      <div className="text-2xl font-medium mb-1">{stat.val}</div>
                      <div className="text-[11px] text-white/40">credits this cycle</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB: MEMORY */}
          {activeTab === 'memory' && (
            <div className="animate-in slide-in-from-bottom-2 fade-in duration-300">
              <h2 className="text-2xl font-semibold mb-8 pb-4 border-b border-white/5">Memory</h2>
              
              <div className="mb-8">
                <div className="flex items-center justify-between py-5 border-b border-white/5">
                  <div>
                    <h4 className="text-sm font-medium mb-1">Use search history</h4>
                    <p className="text-[13px] text-white/60">Use previous searches to answer future questions</p>
                  </div>
                  <Toggle checked={useSearchHistory} onChange={(val) => handleToggle('searchhistory', val, setUseSearchHistory)} />
                </div>
                
                <div className="flex items-center justify-between py-5 border-b border-white/5">
                  <div>
                    <h4 className="text-sm font-medium mb-1">Notes</h4>
                    <p className="text-[13px] text-white/60">Save simple details from your sessions and use them in future answers</p>
                  </div>
                  <Toggle checked={useNotes} onChange={(val) => handleToggle('notes', val, setUseNotes)} />
                </div>
              </div>

              <div className="h-[300px] w-full border border-white/10 rounded-xl flex items-center justify-center bg-[#1a1a1a]">
                <p className="text-white/40 text-sm">No memories recorded yet</p>
              </div>
            </div>
          )}

          {/* TAB: PURCHASES (one-time feature unlocks) */}
          {activeTab === 'purchases' && (
            <div className="animate-in slide-in-from-bottom-2 fade-in duration-300">
              <h2 className="text-2xl font-semibold mb-8 pb-4 border-b border-white/5">Activate Features</h2>
              <ActivateFeaturesSection />
            </div>
          )}

          {/* GENERIC EMPTY STATE FOR OTHER TABS */}
          {!['account', 'usage', 'memory', 'purchases'].includes(activeTab) && (
            <div className="animate-in slide-in-from-bottom-2 fade-in duration-300">
               <h2 className="text-2xl font-semibold mb-8 pb-4 border-b border-white/5 capitalize">{activeTab}</h2>
               <p className="text-white/50 text-sm">Content for {activeTab} is not available yet.</p>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean, onChange: (v: boolean) => void }) {
  return (
    <button 
      onClick={() => onChange(!checked)}
      className={`w-10 h-6 rounded-full relative transition-colors duration-200 focus:outline-none ${checked ? 'bg-[#b7cba6]' : 'bg-white/20'}`}
    >
      <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-[#1a0b2e] transition-transform duration-200 ${checked ? 'translate-x-4' : 'translate-x-0'}`}></div>
    </button>
  )
}
