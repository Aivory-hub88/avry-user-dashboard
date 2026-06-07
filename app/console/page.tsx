"use client"

import { useRouter } from "next/navigation"
import { useState, useRef, useEffect, useCallback } from "react"
import Image from "next/image"
import ChatMessage from "@/components/ChatMessage"
import ChatInput from "@/components/ChatInput"
import ConsoleTopBar from "@/components/console/ConsoleTopBar"
import SuggestionChips from "@/components/chat/SuggestionChips"
import ActionList from "@/components/chat/ActionList"
import { RoutingSuggestBanner } from "@/components/chat/RoutingSuggestBanner"
import { useAgenticStream } from "@/hooks/useAgenticStream"
import { useIntentRouter } from "@/hooks/useIntentRouter"
import { useFileUpload } from "@/hooks/useFileUpload"
import { useChat } from "@/hooks/useChat"
import { listConnections, APP_CATALOG } from "@/lib/integrations/store"
import UploadMenu from "@/components/UploadMenu"
import type { Attachment } from "@/components/UploadMenu"
import { AttachmentCard } from "@/components/AttachmentCard"

interface Toast { id: string; type: "success" | "error"; message: string }

interface ChipOption {
  text: string
  action: "assist" | "redirect"
  tab?: string
}

interface ChipData {
  id: string
  label: string
  options: ChipOption[]
}

const CHIPS: ChipData[] = [
  {
    id: "deep-diagnostic",
    label: "Deep Diagnostic",
    options: [
      { text: "Assist me with AI readiness deep diagnostic within the console", action: "assist" },
      { text: "Direct me to deep diagnostic tab", action: "redirect", tab: "/diagnostics/deep" },
    ],
  },
  {
    id: "blueprint",
    label: "Blueprint",
    options: [
      { text: "Help me build an AI system blueprint in the console", action: "assist" },
      { text: "Direct me to blueprint tab", action: "redirect", tab: "/blueprint" },
    ],
  },
  {
    id: "integration",
    label: "Integration",
    options: [
      { text: "Guide me through connecting a new integration", action: "assist" },
      { text: "Direct me to integrations tab", action: "redirect", tab: "/integrations" },
    ],
  },
  {
    id: "workflow",
    label: "Workflow",
    options: [
      { text: "Help me design or optimise a workflow here", action: "assist" },
      { text: "Direct me to workflow tab", action: "redirect", tab: "/workflows" },
    ],
  },
  {
    id: "agents",
    label: "Agents",
    options: [
      { text: "Help me configure or deploy an agent", action: "assist" },
      { text: "Direct me to agents tab", action: "redirect", tab: "/agents" },
    ],
  },
]

const MAX_VISIBLE_INTEGRATIONS = 4

export default function ConsolePage() {
  const router = useRouter()

  // UI-only state
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [activeChip, setActiveChip] = useState<string | null>(null)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 })
  const [inputValue, setInputValue] = useState("")
  const [connectorsOpen, setConnectorsOpen] = useState(false)
  const [uploadMenuOpen, setUploadMenuOpen] = useState(false)

  // Refs
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const chipsWrapRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const addToast = useCallback((type: Toast["type"], message: string) => {
    const id = Math.random().toString(36).slice(2)
    setToasts(p => [...p, { id, type, message }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000)
  }, [])

  // Hooks that stay in page.tsx (return values used in JSX)
  const { agenticState, processEvent, reset: resetAgentic } = useAgenticStream()
  const { pendingRoute, triggerClassification, dismissRoute, acceptRoute } = useIntentRouter()

  // Extracted hooks
  const { attachments, setAttachments, isDragging, handleFileSelect } = useFileUpload(addToast)
  const {
    messages,
    sessions,
    currentSessionId,
    isStreaming,
    followUpSuggestions,
    setFollowUpSuggestions,
    isClarification,
    handleSend,
    handleNewChat,
    switchSession,
  } = useChat({
    attachments,
    clearAttachments: () => setAttachments([]),
    processEvent,
    resetAgentic,
    triggerClassification,
    addToast,
  })

  // Fetch connected integrations from store
  const connectedIntegrations = listConnections("default")
    .filter(conn => conn.status === "connected")
    .map(conn => {
      const app = APP_CATALOG.find(a => a.id === conn.appId)
      return {
        id: conn.id,
        name: conn.displayName || conn.appName,
        iconPath: app?.iconPath || "",
        appId: conn.appId,
      }
    })

  const fallbackIcons = APP_CATALOG.slice(0, MAX_VISIBLE_INTEGRATIONS).map(app => ({
    id: app.id,
    name: app.name,
    iconPath: app.iconPath || "",
    appId: app.id,
  }))

  const displayIntegrations = connectedIntegrations.length > 0
    ? connectedIntegrations.slice(0, MAX_VISIBLE_INTEGRATIONS)
    : fallbackIcons

  const overflowCount = connectedIntegrations.length > MAX_VISIBLE_INTEGRATIONS
    ? connectedIntegrations.length - MAX_VISIBLE_INTEGRATIONS
    : 0

  const openChip = (chipId: string, chipEl: HTMLButtonElement) => {
    if (!chipsWrapRef.current) return
    if (activeChip === chipId) {
      setActiveChip(null)
      return
    }
    const chipRect = chipEl.getBoundingClientRect()
    const wrapRect = chipsWrapRef.current.getBoundingClientRect()
    setDropdownPos({
      top: chipRect.bottom - wrapRect.top + 10,
      left: chipRect.left - wrapRect.left + chipRect.width / 2,
    })
    setActiveChip(chipId)
  }

  const handleChipOption = (option: ChipOption) => {
    if (option.action === "assist") {
      setInputValue(option.text)
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.style.height = "auto"
          textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`
          textareaRef.current.focus()
        }
      })
    }
    if (option.action === "redirect" && option.tab) {
      router.push(option.tab)
    }
    setActiveChip(null)
  }

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        setActiveChip(null)
      }
    }
    document.addEventListener("mousedown", handleOutsideClick)
    return () => document.removeEventListener("mousedown", handleOutsideClick)
  }, [])

  const activeChipData = CHIPS.find((chip) => chip.id === activeChip)

  return (
    <div className="flex flex-col h-full bg-[#353531]">
      <ConsoleTopBar onNewChat={handleNewChat} />

      <div className="flex-1 flex flex-col overflow-hidden h-full">
        {messages.length === 0 ? (
          <div className="flex min-h-full items-start justify-center px-6 pt-[12vh]">
            <div className="flex w-full max-w-[800px] flex-col items-center">
              <div
                className="mb-8 flex items-center gap-4 [animation:fadeUp_0.55s_0s_cubic-bezier(0.22,1,0.36,1)_both]"
                style={{ alignItems: 'center' }}
              >
                <img
                  src="/Aivory_Avatar.svg"
                  alt="Aivory"
                  width={44}
                  height={44}
                  style={{ display: 'block', width: 44, height: 44, flexShrink: 0, marginTop: 8 }}
                />
                <h1
                  className="font-light"
                  style={{
                    fontSize: "clamp(26px, 4.5vw, 42px)",
                    letterSpacing: "-0.025em",
                    color: "rgba(255,255,255,0.92)",
                    lineHeight: 1,
                    margin: 0,
                  }}
                >
                  what can i do for you?
                </h1>
              </div>

              <div className="mb-2 flex w-full flex-wrap justify-center gap-2 [animation:fadeUp_0.55s_0.07s_cubic-bezier(0.22,1,0.36,1)_both]">
                <button className="console-pill inline-flex items-center gap-1.5">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
                  </svg>
                  Attach Context
                </button>
                <button className="console-pill inline-flex items-center gap-1.5">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="8" y1="6" x2="21" y2="6"/>
                    <line x1="8" y1="12" x2="21" y2="12"/>
                    <line x1="8" y1="18" x2="21" y2="18"/>
                    <line x1="3" y1="6" x2="3.01" y2="6"/>
                    <line x1="3" y1="12" x2="3.01" y2="12"/>
                    <line x1="3" y1="18" x2="3.01" y2="18"/>
                  </svg>
                  Execution Log
                </button>
                <button className="console-pill inline-flex items-center gap-1.5">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="3"/>
                    <path d="M9 9h6M9 12h6M9 15h4"/>
                  </svg>
                  Blueprint Mode
                </button>
                <button
                  className="console-pill inline-flex items-center gap-1.5"
                  onClick={() => setUploadMenuOpen(o => !o)}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  Upload File
                </button>
              </div>

              <div className="relative w-full [animation:fadeUp_0.55s_0.13s_cubic-bezier(0.22,1,0.36,1)_both]">
                <div className="console-input-card w-full overflow-hidden">
                {/* Attachment cards from drag & drop */}
                {attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 px-5 pt-3">
                    {attachments.map((att, i) => (
                      <AttachmentCard
                        key={i}
                        attachment={att}
                        onRemove={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
                      />
                    ))}
                  </div>
                )}
                <div className="px-5 pt-[14px] pb-1">
                  <textarea
                    ref={textareaRef}
                    rows={2}
                    value={inputValue}
                    onChange={(e) => {
                      setInputValue(e.target.value)
                      e.target.style.height = "auto"
                      e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault()
                        if (inputValue.trim() || attachments.length > 0) {
                          handleSend(inputValue, attachments)
                          setInputValue("")
                          if (textareaRef.current) textareaRef.current.style.height = "auto"
                        }
                      }
                    }}
                    placeholder="Send Message to Aivory..."
                    className="console-textarea w-full"
                    disabled={isStreaming}
                  />
                </div>
                <div className="flex items-center justify-between px-3 pt-1 pb-3">
                  <div className="flex items-center gap-[6px]">
                    <button
                      className="console-icon-btn"
                      title="Upload file"
                      onClick={() => setUploadMenuOpen(o => !o)}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 5v14M5 12h14"/>
                      </svg>
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      if (inputValue.trim() || attachments.length > 0) {
                        handleSend(inputValue, attachments)
                        setInputValue("")
                        if (textareaRef.current) textareaRef.current.style.height = "auto"
                      }
                    }}
                    className="console-send-btn"
                    aria-label="Send"
                    disabled={isStreaming}
                  >
                    ↑
                  </button>
                </div>
                <button 
                  onClick={() => setConnectorsOpen(true)}
                  className="console-connect-banner flex items-center justify-between px-[18px] py-[10px] w-full cursor-pointer transition-opacity hover:opacity-80"
                >
                  <div
                    className="flex items-center gap-[7px] text-[12.5px]"
                    style={{ color: "rgba(255,255,255,0.28)" }}
                  >
                    <span>connect your tools to</span>
                    <Image 
                      src="/Aivory_logo_2026.svg" 
                      alt="Aivory" 
                      width={48} 
                      height={12} 
                      className="object-contain opacity-50" 
                    />
                    <div className="flex items-center gap-[5px]">
                      {displayIntegrations.map((integration) => (
                        <div
                          key={integration.id}
                          title={integration.name}
                          className="flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full transition-transform duration-150 hover:scale-110 overflow-hidden"
                          style={{ background: "#42423f" }}
                        >
                          {integration.iconPath && (
                            <Image
                              src={integration.iconPath}
                              alt={integration.name}
                              width={16}
                              height={16}
                            />
                          )}
                        </div>
                      ))}
                      {overflowCount > 0 && (
                        <div className="console-overflow-pill">+{overflowCount}</div>
                      )}
                    </div>
                  </div>
                </button>
              </div>
              <UploadMenu
                isOpen={uploadMenuOpen}
                onClose={() => setUploadMenuOpen(false)}
                onAttach={(attachment) => {
                  setAttachments(prev => [...prev, attachment])
                  setUploadMenuOpen(false)
                }}
                onToast={(msg) => addToast("error", msg)}
              />
            </div>

            <div
              ref={chipsWrapRef}
              className="relative mt-3 flex w-full flex-col gap-4 [animation:fadeUp_0.55s_0.20s_cubic-bezier(0.22,1,0.36,1)_both]"
            >
                <div className="flex w-full flex-wrap justify-center gap-2">
                {CHIPS.map((chip) => (
                  <button
                    key={chip.id}
                    onClick={(e) => openChip(chip.id, e.currentTarget)}
                    className={`console-chip ${activeChip === chip.id ? "console-chip--active" : ""}`}
                  >
                    {chip.label}
                  </button>
                ))}
                {activeChipData && (
                  <div
                    ref={dropdownRef}
                    className="console-dropdown [animation:dropIn_0.18s_cubic-bezier(0.22,1,0.36,1)_both]"
                    style={{
                      top: dropdownPos.top,
                      left: dropdownPos.left,
                      transform: "translateX(-50%)",
                    }}
                  >
                    <div className="flex items-center justify-between border-b border-white/10 px-4 py-[13px]">
                      <div className="text-[13.5px] font-medium text-white/90">
                        {activeChipData.label}
                      </div>
                      <button
                        onClick={() => setActiveChip(null)}
                        className="flex h-[22px] w-[22px] items-center justify-center rounded-full text-white/45 transition hover:bg-white/10 hover:text-white/90"
                      >
                        ✕
                      </button>
                    </div>
                    {activeChipData.options.map((option, index) => (
                      <button
                        key={index}
                        onClick={() => handleChipOption(option)}
                        className={`console-dropdown-item ${index > 0 ? "border-t border-white/10" : ""}`}
                      >
                        {option.text}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          </div>
        ) : (
          <>
            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-8 py-8 pb-44">
              <div className="max-w-[800px] mx-auto gap-0 flex flex-col">
                {messages.map(m => {
                  console.log('[ConsolePage] rendering message:', m.role, '| isStreaming:', m.isStreaming, '| id:', m.id)
                  return (
                    <div key={m.id}>
                      <ChatMessage 
                        role={m.role} 
                        content={m.content} 
                        isStreaming={m.isStreaming} 
                        attachments={m.attachments}
                        agenticState={m.role === 'assistant' && m.id === messages[messages.length - 1]?.id ? agenticState : undefined}
                        onAcceptRoute={acceptRoute}
                        onDismissRoute={dismissRoute}
                      />
                    </div>
                  )
                })}
                <div ref={messagesEndRef} />
                {pendingRoute && messages.length > 0 && messages[messages.length - 1]?.role === 'assistant' && !messages[messages.length - 1]?.isStreaming && (
                  <div className="mt-2">
                    <RoutingSuggestBanner 
                      intent={pendingRoute} 
                      onAccept={acceptRoute} 
                      onDismiss={dismissRoute} 
                    />
                  </div>
                )}
                {messages.length > 0 && messages[messages.length - 1].role === "assistant" && !isStreaming && !messages[messages.length - 1]?.isStreaming && (
                  <>
                    {isClarification && followUpSuggestions.length > 0 ? (
                      <div className="mt-3">
                        <ActionList
                          items={followUpSuggestions.map(s => ({ label: s }))}
                          onSelect={(label) => {
                            setFollowUpSuggestions([])
                            handleSend(label, [])
                          }}
                        />
                      </div>
                    ) : followUpSuggestions.length > 0 ? (
                      <SuggestionChips
                        suggestions={followUpSuggestions}
                        onSelect={(suggestion) => {
                          setFollowUpSuggestions([])
                          handleSend(suggestion, [])
                        }}
                      />
                    ) : null}
                  </>
                )}
              </div>
            </div>
            <div className="sticky bottom-0 z-10 px-8 pt-2 pb-4" style={{ background: 'linear-gradient(to bottom, transparent, #353531 24px)' }}>
              <div className="max-w-[800px] mx-auto">
                <ChatInput
                  onSend={(text: string, atts: Attachment[]) => handleSend(text, atts)}
                  disabled={isStreaming}
                  pendingAttachments={attachments}
                  onClearPendingAttachments={() => setAttachments([])}
                  onRemoveAttachment={(i) => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Toast container */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map(toast => (
          <div key={toast.id} className={`px-4 py-2 rounded-lg text-sm ${
            toast.type === "success"
              ? "bg-green-900/50 border border-green-700 text-green-300"
              : "bg-red-900/50 border border-red-700 text-red-300"
          }`}>
            {toast.message}
          </div>
        ))}
      </div>

      {/* History sidebar */}
      <aside
        className={`fixed top-0 right-0 h-full w-72 z-40 flex flex-col transition-transform duration-300 ease-in-out ${sidebarOpen ? "translate-x-0" : "translate-x-full"}`}
        style={{
          background: "#353531",
          backdropFilter: "blur(16px)",
          borderLeft: "1px solid rgba(255, 255, 255, 0.08)",
        }}
      >
        <div className="flex items-center justify-between px-4 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <span className="text-sm font-semibold text-text-primary">Chat History</span>
          <button
            className="w-8 h-8 rounded-lg flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors duration-150"
            style={{ background: "rgba(255,255,255,0.06)" }}
            onClick={() => setSidebarOpen(false)}
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {sessions.length === 0 ? (
            <p className="text-sm text-text-secondary px-4 py-3">No chat history yet.</p>
          ) : (
            sessions.map(s => {
              const isActive = s.id === currentSessionId
              return (
                <div
                  key={s.id}
                  className={`px-4 py-3 cursor-pointer text-sm text-text-secondary transition-colors duration-150 rounded-lg mx-2 ${isActive ? "bg-[rgba(0,229,158,0.08)] border-l-2 border-accent text-text-primary" : "hover:bg-[rgba(255,255,255,0.04)]"}`}
                  onClick={() => {
                    if (s.id === currentSessionId) return
                    switchSession(s.id)
                  }}
                >
                  <div className="truncate text-sm font-medium">
                    {s.title || "New chat"}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </aside>

      {isDragging && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center pointer-events-none">
          <div className="px-6 py-4 border-2 border-dashed border-emerald-400 rounded-2xl text-emerald-300 text-lg">
            Drop files to attach
          </div>
        </div>
      )}

      {connectorsOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setConnectorsOpen(false)}
        >
          <div 
            className="relative w-full max-w-[680px] rounded-2xl border border-white/10 p-8 shadow-2xl"
            style={{ background: "#42423f" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setConnectorsOpen(false)}
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white/90"
            >
              ✕
            </button>

            <h2 className="mb-2 text-2xl font-semibold text-white/95">Connectors</h2>
            <p className="mb-6 text-sm text-white/50">
              Connect your tools and services to Aivory
            </p>

            <div className="grid grid-cols-3 gap-3 max-h-[420px] overflow-y-auto pr-2">
              {APP_CATALOG.map((app) => {
                const connection = connectedIntegrations.find(c => c.appId === app.id)
                const isConnected = !!connection
                return (
                  <button
                    key={app.id}
                    onClick={() => {
                      setConnectorsOpen(false)
                      router.push("/integrations")
                    }}
                    className="group relative flex flex-col items-center gap-3 rounded-xl border border-white/10 bg-[#353531] p-4 transition hover:border-white/20 hover:bg-[#3a3a36]"
                  >
                    {isConnected && (
                      <div className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20">
                        <div className="h-2 w-2 rounded-full bg-emerald-400"></div>
                      </div>
                    )}
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/5">
                      {app.iconPath ? (
                        <Image
                          src={app.iconPath}
                          alt={app.name}
                          width={28}
                          height={28}
                          className="object-contain"
                        />
                      ) : (
                        <span className="text-2xl">{app.icon}</span>
                      )}
                    </div>
                    <div className="text-center">
                      <div className="text-sm font-medium text-white/90">{app.name}</div>
                      <div className="mt-1 text-xs text-white/40 line-clamp-2">
                        {app.description}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => {
                  setConnectorsOpen(false)
                  router.push("/integrations")
                }}
                className="rounded-[20px] bg-[#353532] px-5 py-2.5 text-sm font-medium text-[#f7f7f7] border border-[#666864] transition hover:bg-[#444440]"
              >
                Manage Integrations
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
