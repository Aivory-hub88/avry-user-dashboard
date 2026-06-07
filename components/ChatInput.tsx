"use client"

import { useState, useRef, useEffect, KeyboardEvent, ChangeEvent } from "react"
import UploadMenu, { Attachment } from "./UploadMenu"
import ContextToolbar from "./input/ContextToolbar"
import { AttachmentCard } from "./AttachmentCard"

interface ChatInputProps {
  onSend: (message: string, attachments: Attachment[]) => void
  disabled?: boolean
  prefill?: string
  hasPendingFiles?: boolean
  pendingAttachments?: Attachment[]
  onClearPendingAttachments?: () => void
  onRemoveAttachment?: (index: number) => void
}

export default function ChatInput({ onSend, disabled = false, prefill, hasPendingFiles = false,
  pendingAttachments = [],
  onClearPendingAttachments,
  onRemoveAttachment,
}: ChatInputProps) {
  const [message, setMessage] = useState(prefill ?? "")
  const [activeTool, setActiveTool] = useState<string | null>(null)

  useEffect(() => {
    if (prefill) {
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
    const finalMessage = trimmed || `Please analyze this file`
    console.log('[INPUT DEBUG] calling onSend with message:', finalMessage)
    onSend(finalMessage, allAttachments)
    setMessage("")
    setAttachment(null)
    onClearPendingAttachments?.()
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value)
    if (textareaRef.current) {
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

      {/* Input card — matches reference: rounded container, text on top, icons below */}
      <div className="bg-[#42423f] border border-white/10 rounded-2xl overflow-hidden">
        {/* Textarea area */}
        <textarea
          ref={textareaRef}
          placeholder="Send Message to Aivory..."
          value={message}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={1}
          className="w-full bg-transparent px-4 pt-3.5 pb-2 text-base text-zinc-100 placeholder:text-[#a1a1aa] focus:outline-none resize-none text-left"
        />

        {/* Bottom toolbar row: icons left, send right */}
        <div className="flex items-center justify-between px-3 pb-3">
          <div className="flex items-center gap-1">
            {/* Attach / upload button — + icon */}
            <button
              className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center text-zinc-400 hover:text-zinc-200 hover:border-white/20 transition-colors"
              onClick={() => setUploadMenuOpen(o => !o)}
              aria-label="Upload file"
              type="button"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14"/>
              </svg>
            </button>
          </div>

          {/* Send button */}
          <button
            className="w-8 h-8 rounded-[20px] bg-[#353532] text-white border border-[#666864] hover:bg-[#444440] disabled:bg-zinc-600 disabled:text-zinc-400 disabled:border-transparent transition-colors flex items-center justify-center"
            onClick={handleSend}
            disabled={!canSend}
            aria-label="Send"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5M5 12l7-7 7 7"/>
            </svg>
          </button>
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
