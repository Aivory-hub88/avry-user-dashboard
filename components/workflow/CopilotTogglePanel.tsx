'use client'

/**
 * CopilotTogglePanel
 *
 * Key fixes vs old version:
 * - Removed isWorkflowIntent() + WORKFLOW_KEYWORDS — this was the main culprit
 *   splitting traffic between sendChat and buildWorkflow, breaking conversation
 * - Single onSendMessage prop flows into useWorkflowCopilot.sendMessage
 * - Apply-to-canvas button shown when canApply = true (server-driven, not keyword-driven)
 * - isTesting indicator shown during TESTING / FIXING stages
 * - Text size matched to floating assistant: text-[13px]
 */

import { useRef, useState, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useCopilotPanel } from '@/hooks/useCopilotPanel'
import { useWorkflowCopilot } from '@/hooks/useWorkflowCopilot'
import type { CopilotMessage } from '@/hooks/useWorkflowCopilot'
import type { GeneratedWorkflow } from '@/lib/workflows/copilotClient'

// File icon helpers
const FILE_ICONS = {
  pdf: { color: '#60a5fa', path: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zM14 2v6h6' },
  image: { color: '#f59e0b', path: 'M21 15a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h4l2 3h8a2 2 0 012 2z' },
  default: { color: '#2dd4a0', path: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zM14 2v6h6M8 13h8M8 17h4' },
}

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return FILE_ICONS.image
  if (ext === 'pdf') return FILE_ICONS.pdf
  return FILE_ICONS.default
}

function AivoryLogo() {
  return (
    <img
      src="/Aivory_logo_2026.svg"
      alt="Aivory"
      className="h-6 object-contain"
      aria-label="Aivory"
    />
  )
}

interface CopilotTogglePanelProps {
  currentSpec?: unknown
  currentWorkflowName?: string
  onApplyWorkflow?: (workflow: GeneratedWorkflow) => void
  onApplySuggestion?: (workflow: GeneratedWorkflow) => void
}

export function CopilotTogglePanel({ onApplyWorkflow, onApplySuggestion }: CopilotTogglePanelProps) {
  const { isOpen, open, close } = useCopilotPanel()
  const {
    messages,
    loading,
    loadingHint,
    error,
    stage,
    workflow,
    canApply,
    isCompleted,
    isTesting,
    sendMessage,
    reset,
  } = useWorkflowCopilot()

  // Support both prop names for backward compatibility
  const applyHandler = onApplyWorkflow || onApplySuggestion

  // Don't reset on open/close — messages persist via localStorage.
  // Only the explicit "Clear" button (onClear={reset}) wipes the conversation.
  const handleOpen = useCallback(() => { open() }, [open])
  const handleClose = useCallback(() => { close() }, [close])

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30">
      {isOpen ? (
        <CopilotPanelExpanded
          onClose={handleClose}
          messages={messages}
          loading={loading}
          loadingHint={loadingHint}
          error={error}
          stage={stage}
          isTesting={isTesting}
          workflow={workflow}
          canApply={canApply}
          isCompleted={isCompleted}
          onSendMessage={sendMessage}
          onApplyWorkflow={applyHandler}
          onClear={reset}
        />
      ) : (
        <CopilotBarCollapsed onClick={handleOpen} />
      )}
    </div>
  )
}

/* ── Collapsed pill ───────────────────────────────────── */

function CopilotBarCollapsed({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#2d2d2a] border border-white/10 text-[#f7f7f7] text-[13px] font-medium cursor-pointer shadow-lg hover:border-[#666864] hover:shadow-xl transition-all duration-150 select-none"
      onClick={onClick}
      aria-label="Open Aivory Copilot"
    >
      <img src="/Aivory_logo_2026.svg" alt="" className="h-4 object-contain" aria-hidden="true" />
      <span>Aivory Copilot</span>
      <span className="text-[11px] text-[#a1a1aa] ml-1">/ or &#8984;K</span>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#a1a1aa] ml-0.5">
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    </button>
  )
}

/* ── Expanded floating panel ──────────────────────────── */

interface CopilotPanelExpandedProps {
  onClose: () => void
  messages: CopilotMessage[]
  loading: boolean
  loadingHint: string | null
  error: string | null
  stage: string
  isTesting: boolean
  workflow: GeneratedWorkflow | null
  canApply: boolean
  isCompleted: boolean
  onSendMessage: (text: string) => Promise<void>
  onApplyWorkflow?: (workflow: GeneratedWorkflow) => void
  onClear?: () => void
}

function CopilotPanelExpanded({
  onClose, messages, loading, loadingHint, error,
  stage, isTesting, workflow, canApply, isCompleted,
  onSendMessage, onApplyWorkflow, onClear,
}: CopilotPanelExpandedProps) {
  const [input, setInput] = useState('')
  const [attachedFiles, setAttachedFiles] = useState<File[]>([])
  const [appliedToCanvas, setAppliedToCanvas] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 80)
  }, [])

  useEffect(() => {
    setAppliedToCanvas(false)
  }, [workflow?.workflowName, workflow?.steps.length])

  const hasMessages = messages.length > 0 || loading
  const hasContent = input.trim().length > 0 || attachedFiles.length > 0

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const ta = e.target
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 180) + 'px'
  }

  const handleSend = useCallback(() => {
    const trimmed = input.trim()
    if (!hasContent || loading) return
    setInput('')
    setAttachedFiles([])
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    if (trimmed) onSendMessage(trimmed)
  }, [input, hasContent, loading, onSendMessage])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files ?? [])
    setAttachedFiles(prev => {
      const merged = [...prev]
      newFiles.forEach(f => {
        if (!merged.find(a => a.name === f.name)) merged.push(f)
      })
      return merged
    })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index))
  }

  // Stage label shown during active processing
  const stageLabel: Record<string, string> = {
    CLARIFYING: 'Memahami kebutuhan...',
    GENERATING: 'Membuat workflow...',
    TESTING: 'Testing workflow...',
    FIXING: 'Memperbaiki otomatis...',
    APPLYING: 'Menerapkan ke canvas...',
  }

  return (
    <div
      className="w-[520px] max-w-[90vw] rounded-2xl overflow-hidden flex flex-col border border-white/[0.08] shadow-2xl"
      style={{ background: '#3a3a38', maxHeight: 'calc(100vh - 160px)' }}
      role="dialog"
      aria-label="Aivory Copilot"
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.08] shrink-0">
        <div className="flex items-center gap-3">
          <AivoryLogo />
          {/* Active stage badge */}
          {stageLabel[stage] && (
            <span className="text-[10px] text-[#a1a1aa] font-light animate-pulse">
              {stageLabel[stage]}
            </span>
          )}
          {/* isTesting indicator — shown during SANDBOX_TESTING / FIXING */}
          {isTesting && !stageLabel[stage] && (
            <span className="text-[10px] text-amber-400 font-light animate-pulse">
              Testing workflow...
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            className="text-white/40 hover:text-white/80 p-1 rounded-md transition-colors"
            onClick={onClear}
            title="Clear conversation"
            aria-label="Clear conversation"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6M14 11v6"/>
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
          </button>
          <button
            className="text-white/40 hover:text-white/80 p-1 rounded-md transition-colors"
            onClick={onClose}
            title="Collapse"
            aria-label="Collapse copilot"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="18 15 12 9 6 15"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      {!hasMessages ? (
        <div className="flex items-center justify-center px-6 py-8 shrink-0 min-h-[140px]">
          <p className="text-[22px] font-normal text-[#f7f7f7] text-center tracking-tight">
            What do you want to automate?
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2.5" style={{ maxHeight: '360px' }}>
          {messages.map((msg, i) => (
            <div key={i} className={`flex items-start gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              {msg.role === 'assistant' && (
                <div className="shrink-0 mt-0.5">
                  <img src="/Aivory_Avatar.svg" alt="Aivory" className="w-4 h-4" />
                </div>
              )}
              <div className={`flex flex-col gap-1 max-w-[85%] ${msg.role === 'user' ? 'items-end' : ''}`}>
                {msg.role === 'assistant' ? (
                  <div className="text-[13px] leading-[1.55] px-3 py-2 rounded-[10px] bg-white/[0.04] border border-white/5 text-[#f7f7f7] rounded-bl-[2px] break-words text-left [&_strong]:font-semibold [&_em]:italic [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5 [&_p]:m-0 [&_p+p]:mt-1.5 [&_code]:bg-white/10 [&_code]:px-1 [&_code]:rounded [&_code]:text-[12px]">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-[13px] leading-[1.55] m-0 px-3 py-2 rounded-[10px] whitespace-pre-wrap break-words text-left bg-[#282825] border border-white/5 text-[#f7f7f7] rounded-br-[2px]">
                    {msg.content}
                  </p>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex items-start gap-2">
              <div className="shrink-0 mt-0.5">
                <img src="/Aivory_Avatar.svg" alt="Aivory" className="w-4 h-4" />
              </div>
              <div className="flex flex-col gap-1.5 px-3 py-2 bg-white/[0.04] border border-white/5 rounded-[10px] rounded-bl-[2px]">
                <div className="flex gap-1">
                  {[0, 1, 2].map(idx => (
                    <span key={idx} className="w-[5px] h-[5px] rounded-full bg-[#a1a1aa] animate-bounce" style={{ animationDelay: `${idx * 0.2}s` }} />
                  ))}
                </div>
                {loadingHint && (
                  <p className="text-[11px] text-[#a1a1aa] m-0 animate-pulse">
                    {loadingHint}
                  </p>
                )}
              </div>
            </div>
          )}

          {error && <p className="text-[13px] text-red-400 m-1 px-1">{error}</p>}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* ── Apply banner — shown only when server says canApply (workflow ready) ── */}
      {canApply && workflow && onApplyWorkflow && !appliedToCanvas && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-[#353532]/60 border-t border-[#666864]/40 shrink-0 rounded-xl mx-3 mb-2">
          <div className="flex flex-col text-left">
            <span className="text-[13px] text-[#f7f7f7] font-medium">
              Workflow siap -- {workflow.steps.length} langkah
            </span>
            <span className="text-[11px] text-[#a1a1aa]">
              Validated. Setup items: {workflow.setupReport?.nodeRequirements?.length ?? 0}
            </span>
          </div>
          <button
            className="text-[13px] font-semibold px-4 py-1.5 rounded-lg bg-[#6c5ce7] text-white cursor-pointer hover:bg-[#5b4bd6] transition-colors duration-150"
            onClick={() => {
              onApplyWorkflow(workflow)
              setAppliedToCanvas(true)
            }}
          >
            Apply to canvas
          </button>
        </div>
      )}

      {/* ── Completed banner ── */}
      {(isCompleted || appliedToCanvas) && (
        <div className="flex items-center px-4 py-2 bg-emerald-900/20 border-t border-emerald-700/30 shrink-0">
          <span className="text-[13px] text-emerald-400 font-medium text-left">
            Workflow berhasil diterapkan ke canvas
          </span>
        </div>
      )}

      {/* ── File preview strip ── */}
      {attachedFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 px-4 pt-3 shrink-0">
          {attachedFiles.map((file, i) => {
            const icon = getFileIcon(file.name)
            return (
              <div key={i} className="flex items-center gap-2 bg-[#4a4a48] border border-white/10 rounded-lg px-3 py-1.5 text-[13px] text-white/75 max-w-[180px]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={icon.color} strokeWidth="1.8" className="shrink-0">
                  <path d={icon.path}/>
                </svg>
                <span className="truncate flex-1">{file.name}</span>
                <button
                  onClick={() => removeFile(i)}
                  className="text-white/30 hover:text-white/70 ml-1 shrink-0 leading-none"
                  aria-label="Remove attachment"
                >x</button>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Input area ── */}
      <div className="bg-[#2e2e2c] border-t border-white/[0.07] px-4 py-3.5 flex items-end gap-3 shrink-0">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          accept=".json,.txt,.csv,.pdf,.png,.jpg,.jpeg,.yaml,.yml,.env,.log"
          onChange={handleFileChange}
        />
        <textarea
          ref={textareaRef}
          className="flex-1 bg-transparent border-none outline-none resize-none text-[#f7f7f7] text-[13px] leading-relaxed placeholder:text-white/30 min-h-[22px] max-h-[180px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden caret-teal-400 disabled:opacity-50 text-left"
          rows={1}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Enter an idea or app name to get started"
          disabled={loading}
          aria-label="Message Aivory"
        />
        <button
          className="text-white/40 hover:text-white/70 flex items-center justify-center p-1 rounded-md transition-colors shrink-0 pb-0.5"
          onClick={() => fileInputRef.current?.click()}
          title="Attach file"
          aria-label="Attach file"
          type="button"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
          </svg>
        </button>
        <button
          className={`w-9 h-9 rounded-[20px] flex items-center justify-center transition-colors shrink-0 ${hasContent ? 'bg-[#353532] border border-[#666864] hover:bg-[#444440]' : 'bg-[#555552]'}`}
          onClick={handleSend}
          disabled={!hasContent || loading}
          aria-label="Send"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="19" x2="12" y2="5"/>
            <polyline points="5 12 12 5 19 12"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
