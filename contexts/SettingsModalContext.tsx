"use client"
import { createContext, useContext, useState, ReactNode } from 'react'

export type SettingsTab =
  | 'account' | 'memory' | 'notifications' | 'usage' | 'purchases'
  | 'upgrade' | 'about'

interface SettingsModalContextValue {
  isOpen: boolean
  activeTab: SettingsTab
  /** Opens the modal, optionally jumping straight to a tab (e.g. 'purchases'
   *  from the Console's Deep Diagnostic gate). Omit tab to reopen wherever
   *  the user last was. */
  openSettingsModal: (tab?: SettingsTab) => void
  closeSettingsModal: () => void
}

const SettingsModalContext = createContext<SettingsModalContextValue | null>(null)

export function SettingsModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<SettingsTab>('account')

  const openSettingsModal = (tab?: SettingsTab) => {
    if (tab) setActiveTab(tab)
    setIsOpen(true)
  }
  const closeSettingsModal = () => setIsOpen(false)

  return (
    <SettingsModalContext.Provider value={{ isOpen, activeTab, openSettingsModal, closeSettingsModal }}>
      {children}
    </SettingsModalContext.Provider>
  )
}

export function useSettingsModal() {
  const ctx = useContext(SettingsModalContext)
  if (!ctx) throw new Error('useSettingsModal must be used within SettingsModalProvider')
  return ctx
}
