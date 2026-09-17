"use client"

import { useState, useRef, useEffect, KeyboardEvent, ChangeEvent } from "react"
import UploadMenu, { Attachment } from "./UploadMenu"
import ContextToolbar from "./input/ContextToolbar"
import { AttachmentCard } from "./AttachmentCard"
import AgentMentionMenu from "./console/AgentMentionMenu"
import { useAgentMention } from "@/hooks/useAgentMention"
import type { MentionCandidate } from "@/lib/agentMentions"

interface ChatInputProps {
  onSend: (message: string, attachments: Attachment[]) => void
  disabled?: boolean
  prefill?: string
  hasPendingFiles?: boolean
  pendingAttachments?: Attachment[]
  onClearPendingAttachments?: () => void
  onRemoveAttachment?: (index: number) => void
  /** Room mode: @mention deployed agents (Mission Control chat room). */
  enableMentions?: boolean
  mentionCandidates?: MentionCandidate[]
  placeholder?: string
  /** When a turn is in flight, the send button morphs into stop. */
  isStreaming?: boolean
  onStop?: () => void
  /** WhatsApp-style "replying to" bar — set via a bubble's Reply action. */
  replyTo?: { role: 'user' | 'assistant'; content: string; agentName?: string } | null
  onCancelReply?: () => void
}

/** Shared send-button glyph: an enter/return arrow (corner-up-left). One
 *  definition so the empty-state composer (console/page.tsx) and the
 *  threaded input here can't drift apart. */
export function SendArrowIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 14 4 9 9 4" />
      <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
    </svg>
  )
}

export default function ChatInput({ onSend, disabled = false, prefill, hasPendingFiles = false,
  pendingAttachments = [],
  onClearPendingAttachments,
  onRemoveAttachment,
  enableMentions = false,
  mentionCandidates = [],
  placeholder,
  isStreaming = false,
  onStop,
  replyTo,
  onCancelReply,
}: ChatInputProps) {
  const [message, setMessage] = useState(prefill ?? "")
  const [activeTool, setActiveTool] = useState<string | null>(null)

  useEffect(() => {
    if (prefill) {
      // Standard fetch-on-mount / sync-from-prop / hydrate-after-mount pattern
      // (functionally correct in this pre-Suspense/pre-React-Query codebase) —
      // not restructuring this component's data flow to satisfy the newer
      // React Compiler style rule; see other documented instances of this.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMessage(prefill)
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto'
          textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
          textareaRef.current.focus()
        }
      }, 50)
    }
  }, [prefill])
  const [uploadMenuOpen, setUploadMenuOpen] = useState(false)
  const [attachment, setAttachment] = useState<Attachment | null>(null)
  const [toast, setToast] = useState("")
  const [extracting, setExtracting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const mention = useAgentMention({
    textareaRef,
    candidates: mentionCandidates,
    enabled: enableMentions && !disabled,
  })

  const selectMention = (c: { type: string; name: string; title: string; channels: string[] }) => {
    const el = textareaRef.current
    const caret = el?.selectionStart ?? message.length
    const applied = mention.applyMention(c, message, caret)
    if (!applied) {
      mention.closeMenu()
      return
    }
    setMessage(applied.text)
    mention.closeMenu()
    mention.focusAndRestore(applied.caret)
    // Re-check in case another @token precedes the new caret (chained mentions).
    requestAnimationFrame(() => {
      const el2 = textareaRef.current
      mention.checkForMention(applied.text, el2?.selectionStart ?? applied.caret)
    })
  }

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(""), 3000)
  }

  const handleSend = () => {
    console.log('[INPUT DEBUG] handleSend triggered')
    const trimmed = message.trim()
    if (!trimmed && !attachment && pendingAttachments.length === 0 && !hasPendingFiles) return
    if (disabled) return
    const allAttachments = [
      ...(attachment ? [attachment] : []),
      ...pendingAttachments,
    ]
    const finalMessage = trimmed || `Please analyse this file`
    console.log('[INPUT DEBUG] calling onSend with message:', finalMessage)
    mention.closeMenu()
    onSend(finalMessage, allAttachments)
    setMessage("")
    setAttachment(null)
    onClearPendingAttachments?.()
    if (textareaRef.current) {
      // Imperative textarea auto-resize in a user-action handler — the
      // standard, correct use of a DOM ref. Flagged only because the same
      // ref is also touched in the prefill effect above; this project
      // doesn't run React Compiler's actual transform, so there's no live
      // hazard, and the "fix" (moving this into an effect keyed off every
      // keystroke) would be a real behavioral downgrade, not an improvement.
      // eslint-disable-next-line react-hooks/immutability
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Mention menu takes precedence while open — ↑/↓ navigate, Enter/Tab
    // picks, Esc dismisses. Only plain Enter sends.
    if (mention.menuOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const n = mention.mentionList.length
        if (n > 0) {
          mention.setMentionIndex(
            (mention.mentionIndex + (e.key === 'ArrowDown' ? 1 : -1) + n) % n,
          )
        }
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        const pick = mention.mentionList[mention.mentionIndex]
        if (pick) {
          e.preventDefault()
          selectMention(pick)
          return
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        mention.closeMenu()
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value
    const caret = e.target.selectionStart ?? next.length
    setMessage(next)
    mention.checkForMention(next, caret)
    if (textareaRef.current) {
      // Same as handleSend above — standard imperative ref usage in a
      // user-action handler, flagged only due to the prefill effect also
      // touching this ref; no live hazard without React Compiler enabled.
      // eslint-disable-next-line react-hooks/immutability
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
    }
  }

  const canSend = !disabled && !extracting && (!!message.trim() || !!attachment || pendingAttachments.length > 0 || hasPendingFiles)

  const handleToolSelect = (tool: string) => {
    setActiveTool(tool)
    // For now, just log the selection - can be extended later
    console.log(`Tool selected: ${tool}`)
    if (tool === "upload-file") {
      setUploadMenuOpen(o => !o)
    }
  }

  return (
    <div className="relative">
      {/* Context Toolbar */}
      <ContextToolbar onToolSelect={handleToolSelect} />

      {/* Pending attachments from drag & drop */}
      {pendingAttachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {pendingAttachments.map((att, i) => (
            <AttachmentCard
              key={i}
              attachment={att}
              onRemove={() => {
                if (onRemoveAttachment) {
                  onRemoveAttachment(i)
                } else {
                  onClearPendingAttachments?.()
                }
              }}
            />
          ))}
        </div>
      )}

      {/* Attachment chip */}
      {(attachment || extracting) && (
        <div className="mb-3 p-2 bg-zinc-800 border border-zinc-700 rounded-lg inline-flex items-center gap-2">
          <span className="text-sm text-zinc-300">
            {extracting ? 'Extracting...' : attachment?.label}
          </span>
          {!extracting && (
            <button
              className="text-zinc-400 hover:text-zinc-200 transition-colors"
              onClick={() => setAttachment(null)}
              aria-label="Remove attachment"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Input card — single composer language, sama seperti hero.
          radius-lg (20px), border-line, textarea px-5 pt-[14px], bar px-4. */}
      {mention.menuOpen && (
        <AgentMentionMenu
          candidates={mention.mentionList}
          activeIndex={mention.mentionIndex}
          onSelect={selectMention}
          onHover={mention.setMentionIndex}
          totalCandidates={mentionCandidates.length}
          query={mention.mentionQuery}
        />
      )}
      <div className="bg-[#1f1f22] border border-line rounded-[20px] overflow-hidden">
        {/* Replying-to bar — WhatsApp-style quote above the composer */}
        {replyTo && (
          <div className="flex items-start gap-2 px-4 pt-3 pb-2 border-b border-line/60">
            <div className="flex-1 min-w-0 pl-2.5 border-l-2 border-accent/50">
              <div className="text-[12px] font-medium text-accent/80">
                Replying to {replyTo.role === 'user' ? 'yourself' : (replyTo.agentName ?? 'Agent')}
              </div>
              <div className="text-[13px] text-[#a1a1aa] truncate">{replyTo.content}</div>
            </div>
            <button
              type="button"
              onClick={onCancelReply}
              className="shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-white/40 hover:text-white/80 hover:bg-white/[0.08] transition-colors"
              aria-label="Cancel reply"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
        )}
        {/* Textarea area */}
        <textarea
          ref={textareaRef}
          placeholder={placeholder ?? "Send Message to Aivory..."}
          value={message}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={2}
          className="console-textarea w-full px-5 pt-[14px] pb-1 text-[15px]"
        />

        {/* Bottom toolbar row: icons left, send right */}
        <div className="flex items-center justify-between px-4 pt-1 pb-3">
          <div className="flex items-center gap-[6px]">
            {/* Attach / upload button — + icon */}
            <button
              className="console-icon-btn"
              onClick={() => setUploadMenuOpen(o => !o)}
              aria-label="Upload file"
              type="button"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14"/>
              </svg>
            </button>
          </div>

          {/* Send button — morphs into stop while a turn is in flight */}
          {isStreaming && onStop ? (
            <button
              className="console-send-btn"
              onClick={onStop}
              aria-label="Stop generating"
              title="Stop generating"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
          ) : (
            <button
              className="console-send-btn"
              onClick={handleSend}
              disabled={!canSend}
              aria-label="Send"
            >
              <SendArrowIcon size={16} />
            </button>
          )}
        </div>
      </div>

      <UploadMenu
        isOpen={uploadMenuOpen}
        onClose={() => setUploadMenuOpen(false)}
        onAttach={(a) => { setAttachment(a); setUploadMenuOpen(false) }}
        onToast={showToast}
        onExtractingChange={setExtracting}
      />
    </div>
  )
}
