'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import type { CopilotMessage } from '@/hooks/useWorkflowCopilot'

// CopilotSuggestion — defined locally since it's only used by this component
export interface CopilotSuggestion {
  steps: Array<{ id: string; name: string; type: string; config?: Record<string, unknown> }>
  description?: string
  workflowName?: string
}

// Extend CopilotMessage locally to support optional suggestion attachment
type CopilotMessageWithSuggestion = CopilotMessage & { suggestion?: CopilotSuggestion }

const WORKFLOW_KEYWORDS = [
  'workflow', 'automate', 'automation', 'trigger', 'step', 'build', 'create',
  'generate', 'connect', 'integrate', 'integration', 'when', 'then', 'if',
  'send email', 'notify', 'schedule', 'run', 'execute', 'pipeline',
]

function isWorkflowIntent(text: string): boolean {
  const lower = text.toLowerCase()
  return WORKFLOW_KEYWORDS.some(kw => lower.includes(kw))
}

interface Props {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  messages: CopilotMessageWithSuggestion[]
  loading: boolean
  error: string | null
  lastSuggestion: CopilotSuggestion | null
  onSendChat: (msg: string) => void
  onBuildWorkflow: (prompt: string) => void
  onApplySuggestion?: (suggestion: CopilotSuggestion) => void
  currentWorkflowName?: string
  clearMessages?: () => void
}

export function AiraCopilotFloating({
  isOpen, onOpenChange, messages, loading, error,
  lastSuggestion, onSendChat, onBuildWorkflow,
  onApplySuggestion, currentWorkflowName, clearMessages,
}: Props) {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    if (isOpen) setTimeout(() => textareaRef.current?.focus(), 80)
  }, [isOpen])

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 80) + 'px'
  }

  const handleSend = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed || loading) return
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    if (isWorkflowIntent(trimmed)) onBuildWorkflow(trimmed)
    else onSendChat(trimmed)
  }, [input, loading, onSendChat, onBuildWorkflow])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  if (!isOpen) {
    return (
      <button
        className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 h-9 px-4 bg-[rgba(30,29,26,0.92)] border border-accent/25 rounded-full cursor-pointer z-30 backdrop-blur-[8px] shadow-lg hover:border-accent/50 hover:shadow-xl hover:bg-[rgba(35,34,31,0.96)] transition-all duration-150 select-none whitespace-nowrap"
        onClick={() => onOpenChange(true)}
        aria-label="Open Aivory Copilot"
      >
        <img src="/Aivory_Avatar.svg" alt="Aivory" className="w-[18px] h-[18px]" />
        <span className="text-xs font-semibold text-text-secondary tracking-wide">Aivory Copilot</span>
        <span className="text-[11px] text-gray-600">/ or ⌘K</span>
        <span className="text-gray-600 hover:text-accent transition-colors duration-150 flex-shrink-0">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </span>
      </button>
    )
  }

  return (
    <div
      className="fixed bottom-6 right-[88px] z-40 w-80 max-h-[480px] rounded-2xl overflow-hidden flex flex-col"
      style={{
        background: 'rgba(15,15,20,0.95)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
      }}
      role="dialog"
      aria-label="Aivory Copilot"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-soft flex-shrink-0 cursor-grab select-none active:cursor-grabbing">
        <div className="flex items-center gap-2.5">
          <img src="/Aivory_Avatar.svg" alt="Aivory" className="w-5 h-5" />
          <span className="font-semibold text-sm text-text-primary">Workflow Copilot</span>
          <div className="flex items-center gap-1.5 text-xs text-emerald-400">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Online</span>
          </div>
        </div>
        {currentWorkflowName && (
          <span className="text-xs text-white/35 uppercase tracking-wider truncate max-w-[200px]">{currentWorkflowName}</span>
        )}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {clearMessages && messages.length > 0 && (
            <button
              className="flex items-center justify-center w-[26px] h-[26px] bg-transparent border border-white/7 rounded-md text-text-secondary hover:bg-white/5 hover:text-text-primary hover:border-white/14 transition-all duration-150"
              onClick={clearMessages}
              title="Clear"
              aria-label="Clear conversation"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              </svg>
            </button>
          )}
          <button
            className="flex items-center justify-center w-[26px] h-[26px] bg-transparent border border-white/7 rounded-md text-text-secondary hover:bg-white/5 hover:text-text-primary hover:border-white/14 transition-all duration-150"
            onClick={() => onOpenChange(false)}
            title="Minimize"
            aria-label="Minimize"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="18 15 12 9 6 15"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-2.5 scrollbar-thin scrollbar-thumb-white/1 scrollbar-track-transparent"
           style={{ maxHeight: 'calc(480px - 120px)' }}>
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center gap-1.5 py-6 text-center text-gray-600">
            <img src="/Aivory_Avatar.svg" alt="" className="w-7 h-7 opacity-50" />
            <p className="text-sm font-medium text-text-secondary m-0">Ask Aivory anything</p>
            <p className="text-xs text-gray-600 m-0 leading-relaxed max-w-90">
              Get expert advice on automation, or describe a workflow to build it on the canvas.
            </p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex items-start gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            {msg.role === 'assistant' && (
              <div className="flex-shrink-0 mt-0.5">
                <img src="/Aivory_Avatar.svg" alt="Aivory" className="w-[18px] h-[18px]" />
              </div>
            )}
            <div className={`flex flex-col gap-1.5 ${msg.role === 'user' ? 'items-end' : ''}`}>
              <div className={`max-w-[80%] flex flex-col gap-1.5 ${msg.role === 'user' ? 'items-end' : ''}`}>
                <p className={`text-xs leading-relaxed m-0 px-3 py-2 rounded-[10px] whitespace-pre-wrap break-words font-inherit ${
                  msg.role === 'user'
                    ? 'bg-accent/10 border border-accent/18 text-text-primary rounded-br-[2px]'
                    : 'bg-white/4 border border-white/7 text-text-primary rounded-bl-[2px]'
                }`}>
                  {msg.content}
                </p>
                {msg.suggestion && onApplySuggestion && (
                  <div className="flex gap-1.5 flex-wrap mt-0.5">
                    <button
                      className="bg-accent border-none rounded-md text-black text-xs font-bold px-3.5 py-1.5 cursor-pointer hover:bg-accent/90 transition-colors duration-150 font-inherit"
                      onClick={() => onApplySuggestion(msg.suggestion!)}
                    >
                      Generate on canvas
                    </button>
                    <button
                      className="bg-transparent border border-white/1 rounded-md text-gray-600 text-xs font-semibold px-3.5 py-1.5 cursor-pointer hover:text-text-secondary hover:border-white/2 transition-all duration-150 font-inherit"
                      onClick={() => {}}
                    >
                      Discard
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex items-start gap-2">
            <div className="flex-shrink-0 mt-0.5">
              <img src="/Aivory_Avatar.svg" alt="Aivory" className="w-[18px] h-[18px]" />
            </div>
            <div className="px-3.5 py-2.5 bg-white/4 border border-white/7 rounded-[10px] rounded-bl-[2px]">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1.25 h-1.25 rounded-full bg-text-secondary animate-bounce"
                    style={{ animationDelay: `${i * 0.2}s` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        {error && <p className="text-xs text-red-400 m-1 px-1">{error}</p>}
        <div ref={messagesEndRef} />
      </div>

      {lastSuggestion && onApplySuggestion && (
        <div className="flex items-center justify-between px-3 py-2 bg-accent/6 border-t border-accent/2">
          <span className="text-xs text-accent font-medium">Workflow ready — {lastSuggestion.steps.length} steps generated</span>
          <button
            className="bg-accent border-none rounded-md text-black text-xs font-semibold px-3 py-1.25 cursor-pointer hover:bg-accent/9 transition-all duration-150 font-inherit whitespace-nowrap"
            onClick={() => onApplySuggestion(lastSuggestion)}
          >
            Apply to canvas
          </button>
        </div>
      )}

      <div className="flex items-end gap-2 px-3 py-2 border-t border-white/6 flex-shrink-0">
        <textarea
          ref={textareaRef}
          className="flex-1 bg-white/4 border border-white/8 rounded-[9px] text-text-primary text-sm px-3 py-2.25 outline-none font-inherit resize-none leading-relaxed max-h-20 overflow-y-auto transition-colors duration-150 focus:border-accent/4 disabled:opacity-50 disabled:cursor-not-allowed placeholder:text-gray-600"
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Ask Aivory anything, or describe a workflow to build..."
          disabled={loading}
          rows={1}
          aria-label="Message Aivory"
        />
        <button
          className="flex items-center justify-center w-8.5 h-8.5 bg-accent border-none rounded-lg text-black hover:bg-accent/9 transition-colors duration-150 flex-shrink-0 disabled:opacity-35 disabled:cursor-not-allowed"
          onClick={handleSend}
          disabled={!input.trim() || loading}
          aria-label="Send"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
      <p className="text-[10px] text-accent px-3.5 pb-3 m-0">Enter to send · Shift+Enter for new line</p>
    </div>
  )
}
