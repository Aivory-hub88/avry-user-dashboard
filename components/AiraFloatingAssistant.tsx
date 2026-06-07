"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { usePathname } from "next/navigation"
import Image from "next/image"
import ChatMessage from "@/components/ChatMessageCompact"
import ChatInput from "@/components/ChatInput"
import { getSessionId } from "@/lib/session"
import { streamConsoleResponse, typewriterStream } from "@/lib/streaming"
import { loadRoadmap } from "@/hooks/useRoadmap"
import type { AiryRoadmap } from "@/types/roadmap"
import type { Attachment } from "@/components/UploadMenu"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  isStreaming?: boolean
}

// Pages where the FAB should be visible
const ALLOWED_PATHS = ["/diagnostics", "/blueprint", "/roadmap", "/workflows"]

function getPageContext(pathname: string): string {
  if (pathname.startsWith("/console")) return "console"
  if (pathname.startsWith("/diagnostics")) return "diagnostic"
  if (pathname.startsWith("/blueprint")) return "blueprint"
  if (pathname.startsWith("/roadmap")) return "roadmap"
  if (pathname.startsWith("/workflows")) return "workflows"
  return ""
}
const ACTION_CHIPS = [
  { id: "attach", label: "attach context", icon: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>) },
  { id: "log", label: "execution log", icon: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/></svg>) },
  { id: "blueprint", label: "Blueprint mode", icon: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 9h6M9 12h6M9 15h4"/></svg>) },
  { id: "upload", label: "upload file", icon: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>) },
]

export default function AiraFloatingAssistant() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [sessionId, setSessionId] = useState("")
  const [prefill, setPrefill] = useState("")
  const [mounted, setMounted] = useState(false)
  // Context from non-console tab triggers
  const [activeSourceTab, setActiveSourceTab] = useState<string>("")
  const [activePageContext, setActivePageContext] = useState<Record<string, unknown>>({})
  const chatAreaRef = useRef<HTMLDivElement>(null)
  const fabRef = useRef<HTMLButtonElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [input, setInput] = useState("")
  const hasContent = input.trim().length > 0
  const autoResize = () => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = "auto"
    ta.style.height = Math.min(ta.scrollHeight, 140) + "px"
  }
  const handleChipClick = (chipId: string) => {
    if (chipId === "upload") { fileInputRef.current?.click(); return }
    const labels: Record<string, string> = { attach: "Attach context from current page", log: "Show execution log", blueprint: "Switch to Blueprint mode" }
    const msg = labels[chipId]
    if (msg) handleSend(msg)
  }

  const pageContext = getPageContext(pathname ?? "")
  const visible = ALLOWED_PATHS.some(p => (pathname ?? "").startsWith(p))

  // Init session once
  useEffect(() => {
    setSessionId(getSessionId())
  }, [])

  // Hydration guard
  useEffect(() => { setMounted(true) }, [])

  // Listen for aira:open events from other pages (e.g. Roadmap)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ prefill?: string; sourceTab?: string; pageContext?: Record<string, unknown> }>).detail
      setOpen(true)
      if (detail?.prefill) {
        setPrefill(detail.prefill)
      }
      if (detail?.sourceTab) {
        setActiveSourceTab(detail.sourceTab)
      }
      if (detail?.pageContext) {
        setActivePageContext(detail.pageContext)
      }
    }
    window.addEventListener('aira:open', handler)
    return () => window.removeEventListener('aira:open', handler)
  }, [])

  // Auto-scroll on new messages
  useEffect(() => {
    if (chatAreaRef.current) {
      chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight
    }
  }, [messages])

  // Focus close button when panel opens; return focus to FAB on close
  useEffect(() => {
    if (open) {
      setTimeout(() => closeBtnRef.current?.focus(), 50)
      // Clear prefill after panel opens so it doesn't persist on next open
      if (prefill) setTimeout(() => setPrefill(""), 200)
    }
  }, [open])

  // Escape key closes panel
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose()
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [open])

  // Focus trap inside panel
  useEffect(() => {
    if (!open || !panelRef.current) return
    const focusable = panelRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    const first = focusable[0]
    const last = focusable[focusable.length - 1]

    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last?.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first?.focus()
        }
      }
    }
    document.addEventListener("keydown", trap)
    return () => document.removeEventListener("keydown", trap)
  }, [open, messages])

  const handleClose = useCallback(() => {
    setOpen(false)
    setActiveSourceTab("")
    setActivePageContext({})
    setTimeout(() => fabRef.current?.focus(), 50)
  }, [])

  const handleSend = async (content: string, attachment?: Attachment) => {
    const trimmed = content.trim()
    if (!trimmed && !attachment) return
    if (!sessionId) return

    const defaultMsg = attachment
      ? `Please analyze this ${attachment.type === "image" ? "image" : attachment.type === "blueprint" ? "blueprint" : "file"}`
      : ""

    let messageContent = trimmed || defaultMsg

    if (attachment) {
      const MAX = 20000
      const truncate = (t: string) =>
        t.length <= MAX ? t : t.substring(0, MAX) + "\n\n[Content truncated]"

      if (attachment.type === "json_schema" || attachment.type === "file") {
        messageContent = `File: ${attachment.filename}\n\nContent:\n${truncate(attachment.content ?? "")}\n\nQuestion: ${trimmed || defaultMsg}`
      } else if (attachment.type === "blueprint") {
        messageContent = `Blueprint v${attachment.version}\n\nContent:\n${truncate(JSON.stringify(attachment.data, null, 2))}\n\nQuestion: ${trimmed || defaultMsg}`
      }
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: trimmed || defaultMsg,
    }
    setMessages(prev => [...prev, userMsg])
    setIsLoading(true)

    const assistantId = (Date.now() + 1).toString()
    setMessages(prev => [
      ...prev,
      { id: assistantId, role: "assistant", content: "", isStreaming: true },
    ])

    try {
      // Single canonical path for ALL tabs: /api/aira/stream → /bridge/aira → Zeroclaw
      // Tab-specific context (source_tab + pageContext) is passed via the `context` field.
      // When on roadmap page, include mode=roadmap_explain and the full AiryRoadmap object.
      const effectiveSourceTab = activeSourceTab || pageContext || "unknown"
      const isRoadmap = effectiveSourceTab === "roadmap"
      const currentRoadmap: AiryRoadmap | null = isRoadmap ? loadRoadmap() : null
      const contextPrefix =
        messages.length === 0 && effectiveSourceTab
          ? `[Context: user is on the ${effectiveSourceTab} page] `
          : ""

      const apiMessages = [
        ...messages,
        { ...userMsg, content: contextPrefix + messageContent },
      ].map(m => ({ role: m.role, content: m.content }))

      let accumulated = ""
      let hasError = false

      const baseStream = streamConsoleResponse("/api/aira/stream", {
        session_id: sessionId,
        organization_id: "demo_org",
        messages: apiMessages,
        context: {
          page: effectiveSourceTab,
          mode: isRoadmap ? "roadmap_explain" : "general",
          source_tab: activeSourceTab || pageContext || "unknown",
          ...(isRoadmap && currentRoadmap ? { roadmap: currentRoadmap } : {}),
          pageContext: activePageContext,
        },
      } as any)
      const stream = typewriterStream(baseStream)
      
      for await (const chunk of stream) {
        if (chunk.type === "chunk" && chunk.content) {
          accumulated = chunk.content
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantId
                ? { ...m, content: chunk.content ?? "", isStreaming: true }
                : m
            )
          )
        } else if (chunk.type === "error") {
          hasError = true
          const err = chunk.error || chunk.content || "Streaming error"
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantId
                ? {
                    ...m,
                    content: accumulated
                      ? `${accumulated}\n\nError: ${err}`
                      : `Error: ${err}`,
                    isStreaming: false,
                  }
                : m
            )
          )
          break
        } else if (chunk.type === "done") {
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantId ? { ...m, isStreaming: false } : m
            )
          )
          break
        }
      }

      if (!accumulated && !hasError) {
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId
              ? {
                  ...m,
                  content: "Aivory didn't respond. Please try again.",
                  isStreaming: false,
                }
              : m
          )
        )
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? {
                ...m,
                content: m.content
                  ? `${m.content}\n\nError: ${msg}`
                  : `Error: ${msg}`,
                isStreaming: false,
              }
            : m
        )
      )
    } finally {
      setIsLoading(false)
    }
  }

  if (!mounted || !visible) return null

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="md:hidden fixed inset-0 bg-black/55 z-[1001]"
          onClick={handleClose}
          aria-hidden="true"
        />
      )}

      {/* Floating panel */}
      {open && (
        <div
          ref={panelRef}
          className="fixed bottom-20 right-6 z-50 w-[520px] rounded-2xl overflow-hidden flex flex-col bg-[#3a3a35] animate-in fade-in-0 zoom-in-95 duration-200 ease-out"
          style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.55)', maxHeight: 'calc(100vh - 90px)' }}
          role="dialog"
          aria-modal="true"
          aria-label="Aivory assistant"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08] shrink-0">
            <img src="/Aivory_logo_2026.svg" alt="Aivory" className="h-4 object-contain" />
            <div className="flex items-center gap-2.5">
              {(activeSourceTab || pageContext) && (
                <span className="text-white/40 text-xs font-light tracking-wide lowercase">
                  {activeSourceTab || pageContext}
                </span>
              )}
              <button
                ref={closeBtnRef}
                onClick={handleClose}
                className="flex items-center justify-center w-6 h-6 rounded-md text-white/30 hover:text-white/70 hover:bg-white/[0.08] transition-all duration-150"
                aria-label="Minimize Aivory assistant"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 15l-6-6-6 6"/>
                </svg>
              </button>
            </div>
          </div>

          <div ref={chatAreaRef} className="flex-1 overflow-y-auto px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden min-h-[340px]">
            {messages.length > 0 && messages.map(m => (
              <ChatMessage
                key={m.id}
                role={m.role}
                content={m.content}
                isStreaming={m.isStreaming}
              />
            ))}
          </div>

          <div className="flex gap-1.5 px-3 pb-2 shrink-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {ACTION_CHIPS.map(chip => (
              <button
                key={chip.id}
                onClick={() => handleChipClick(chip.id)}
                className="flex items-center gap-1.5 bg-[#4a4a46]/80 hover:bg-[#545450]/90 border border-white/[0.09] hover:border-white/20 rounded-xl px-2.5 py-1.5 text-white/65 hover:text-white/90 text-[10px] font-light transition-all duration-150 whitespace-nowrap"
              >
                <span className="shrink-0 opacity-70">{chip.icon}</span>
                <span>{chip.label}</span>
              </button>
            ))}
          </div>
          <div className="bg-[#2e2e2b] rounded-xl mx-3 mb-3 px-4 pt-3 pb-3 shrink-0 flex flex-col gap-3">
            <textarea
              ref={textareaRef}
              rows={1}
              placeholder="Send message"
              value={input}
              onChange={e => { setInput(e.target.value); autoResize() }}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  if (hasContent && !isLoading) handleSend(input)
                }
              }}
              disabled={isLoading}
              className="w-full bg-transparent border-none outline-none resize-none text-white/80 text-sm font-light placeholder:text-white/30 min-h-[24px] max-h-[140px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden caret-teal-400 leading-relaxed disabled:opacity-50"
            />
            <div className="flex items-center justify-between">
              <button
                className="w-8 h-8 rounded-full border border-white/20 hover:border-white/40 flex items-center justify-center text-white/40 hover:text-white/70 transition-all"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Attach file"
                type="button"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
                </svg>
              </button>
              <button
                onClick={() => { if (hasContent && !isLoading) handleSend(input) }}
                disabled={!hasContent || isLoading}
                className={`w-8 h-8 rounded-[20px] flex items-center justify-center transition-all ${hasContent ? 'bg-[#353532] text-white border border-[#666864] hover:bg-[#444440]' : 'bg-[#555550] text-white/60'}`}
                aria-label="Send"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 19V5M5 12l7-7 7 7"/>
                </svg>
              </button>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            accept=".json,.txt,.csv,.pdf,.png,.jpg,.jpeg,.yaml,.yml,.env,.log"
            onChange={e => {
              const files = Array.from(e.target.files ?? [])
              if (files.length > 0) {
                handleSend(`Please analyze this file: ${files[0].name}`)
              }
              if (fileInputRef.current) fileInputRef.current.value = ""
            }}
          />
        </div>
      )}

      {/* FAB */}
      <button
        ref={fabRef}
        className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full shadow-lg hover:scale-105 transition-transform duration-200 flex items-center justify-center flex-shrink-0 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-3"
        style={{
          background: 'rgba(53,53,50,0.85)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          border: '1px solid #666864',
        }}
        onClick={() => setOpen(o => !o)}
        aria-label={open ? "Close Aivory assistant" : "Open Aivory assistant"}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Image
          src="/Aivory_Avatar.svg"
          alt=""
          width={20}
          height={20}
          aria-hidden="true"
        />
      </button>
    </>
  )
}
