"use client"
import { createContext, useContext, useState, ReactNode } from 'react'

type Mode = 'Console' | 'Blueprint Mode' | 'Diagnostics' | 'Workflow Mode'

interface ModeContextValue {
  activeMode: Mode
  setActiveMode: (mode: Mode) => void
}

const ModeContext = createContext<ModeContextValue | null>(null)

export function ModeProvider({ children }: { children: ReactNode }) {
  const [activeMode, setActiveMode] = useState<Mode>('Console')
  return (
    <ModeContext.Provider value={{ activeMode, setActiveMode }}>
      {children}
    </ModeContext.Provider>
  )
}

export function useMode() {
  const ctx = useContext(ModeContext)
  if (!ctx) throw new Error('useMode must be used within ModeProvider')
  return ctx
}
