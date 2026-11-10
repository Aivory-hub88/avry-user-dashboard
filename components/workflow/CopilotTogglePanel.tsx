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
import { asset } from "@/lib/asset";
import Image from 'next/image'

import { useRef, useState, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useCopilotPanel, type CopilotPanelMode } from '@/hooks/useCopilotPanel'
import { useWorkflowCopilot } from '@/hooks/useWorkflowCopilot'
import type { CopilotMessage } from '@/hooks/useWorkflowCopilot'
import type { GeneratedWorkflow } from '@/lib/workflows/copilotClient'
import type { CanvasEditContext, ChangePreview } from '@/lib/workflows/canvasCopilot'
import { ThinkingDots } from '@/components/ui/ThinkingDots'
import { SendArrowIcon } from '@/components/ChatInput'

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

/* The workflow assistant is branded Aivory Aether, like the Deep Diagnostic. */
function AetherLogo({ className = 'h-[15px] w-auto' }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={asset('/Aivory_Aether_white.svg')} alt="Aivory Aether" className={className} />
  )
}

const POS_KEY = 'aivory.aether.panelOffset.v1'

/** Where an applied proposal lands: the open canvas (edit) or a new draft. */
export type CopilotApplyTarget = { workflowId: string; title: string } | null

interface CopilotTogglePanelProps {
  currentSpec?: unknown
  currentWorkflowName?: string
  /** Live snapshot of the workflow open on the canvas — enables edit mode. */
  getCanvasContext?: () => CanvasEditContext | null
  /** What applying `workflow` would change on the open canvas (edit mode). */
  getChangePreview?: (workflow: GeneratedWorkflow) => ChangePreview | null
  /** The open workflow is deployed to n8n — Update also saves it there. */
  isDeployed?: boolean
  onApplyWorkflow?: (workflow: GeneratedWorkflow, target: CopilotApplyTarget) => void
  onApplySuggestion?: (workflow: GeneratedWorkflow, target: CopilotApplyTarget) => void
}

export function CopilotTogglePanel({ currentWorkflowName, getCanvasContext, getChangePreview, isDeployed, onApplyWorkflow, onApplySuggestion }: CopilotTogglePanelProps) {
  const { mode, open, close, minimize, restore } = useCopilotPanel()
  const {
    messages,
    loading,
    loadingHint,
    isStreamingReply,
    error,
    stage,
    workflow,
    canApply,
    isCompleted,
    isTesting,
    sendMessage,
    editMessage,
    deleteMessage,
    reset,
    markApplied,
    canvasTarget,
  } = useWorkflowCopilot({ getCanvasContext })

  // Support both prop names for backward compatibility
  const rawApply = onApplyWorkflow || onApplySuggestion
  const applyHandler = rawApply
    ? (wf: GeneratedWorkflow) => { rawApply(wf, canvasTarget); markApplied() }
    : undefined

  // Don't reset on open/close — messages persist via localStorage.
  // Only the explicit "Clear" button (onClear={reset}) wipes the conversation.
  const handleOpen = useCallback(() => { open() }, [open])
  const handleClose = useCallback(() => { close() }, [close])
  const handleMinimize = useCallback(() => { minimize() }, [minimize])
  const handleRestore = useCallback(() => { restore() }, [restore])

  // One spot for the panel and its minimized chip: minimizing leaves the chip
  // exactly where the panel was (on the canvas), and restoring reopens it there.
  // Only closing sends it back to the pill in the top bar.
  const wrapRef = useRef<HTMLDivElement>(null)
  const pos = useFloatingPosition(wrapRef, POS_KEY, mode)

  const status = getAetherStatus({ stage, loading, isStreamingReply, isTesting, canApply: canApply && !!workflow, isCompleted, canvasTarget })

  return (
    <div
      ref={wrapRef}
      className="absolute top-3 left-1/2 z-30 flex flex-col"
      style={{
        // Never taller than the canvas area it floats in; the chat body shrinks.
        maxHeight: 'calc(100% - 24px)',
        transform: mode === 'closed'
          ? 'translateX(-50%)'
          : `translate3d(calc(-50% + ${pos.offset.x}px), ${pos.offset.y}px, 0)`,
        willChange: pos.dragging ? 'transform' : undefined,
      }}
    >
      {mode === 'open' ? (
        <CopilotPanelExpanded
          onDragStart={pos.startDrag}
          onResetPosition={pos.reset}
          dragging={pos.dragging}
          onClose={handleClose}
          onMinimize={handleMinimize}
          messages={messages}
          loading={loading}
          loadingHint={loadingHint}
          isStreamingReply={isStreamingReply}
          error={error}
          stage={stage}
          isTesting={isTesting}
          workflow={workflow}
          canApply={canApply}
          isCompleted={isCompleted}
          onSendMessage={sendMessage}
          onEditMessage={editMessage}
          onDeleteMessage={deleteMessage}
          onApplyWorkflow={applyHandler}
          onClear={reset}
          canvasTarget={canvasTarget}
          getChangePreview={getChangePreview}
          isDeployed={isDeployed}
          canvasName={getCanvasContext ? currentWorkflowName : undefined}
        />
      ) : mode === 'minimized' ? (
        <CopilotChip
          status={status}
          dragging={pos.dragging}
          onDragStart={pos.startDrag}
          wasDragged={pos.wasDragged}
          onRestore={handleRestore}
          onClose={handleClose}
          onResetPosition={pos.reset}
        />
      ) : (
        <CopilotBarCollapsed onClick={handleOpen} status={status} />
      )}
    </div>
  )
}

/* ── Status shown on the pill and the minimized chip ──── */

const STAGE_LABEL: Record<string, string> = {
  CLARIFYING: 'Understanding your request...',
  GENERATING: 'Building workflow...',
  TESTING: 'Testing workflow...',
  FIXING: 'Fixing automatically...',
  APPLYING: 'Applying to canvas...',
}

interface AetherStatus {
  text: string
  /** Aether is working in the background. */
  busy: boolean
  /** A validated proposal is waiting for the user. */
  ready: boolean
}

function getAetherStatus(p: {
  stage: string; loading: boolean; isStreamingReply: boolean; isTesting: boolean
  canApply: boolean; isCompleted: boolean; canvasTarget?: CopilotApplyTarget
}): AetherStatus {
  if (STAGE_LABEL[p.stage]) return { text: STAGE_LABEL[p.stage].replace('...', '…'), busy: true, ready: false }
  if (p.isTesting) return { text: 'Testing workflow…', busy: true, ready: false }
  if (p.loading || p.isStreamingReply) return { text: 'Thinking…', busy: true, ready: false }
  if (p.canApply) return { text: p.canvasTarget ? 'Changes ready · Update canvas' : 'Workflow ready · Apply', busy: false, ready: true }
  if (p.isCompleted) return { text: p.canvasTarget ? 'Canvas updated' : 'Applied to canvas', busy: false, ready: false }
  return { text: 'Ask Aether', busy: false, ready: false }
}

function StatusDot({ status }: { status: AetherStatus }) {
  if (!status.busy && !status.ready) return null
  return (
    <span
      className={`inline-block w-[7px] h-[7px] rounded-full shrink-0 ${status.busy ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`}
      aria-hidden="true"
    />
  )
}

/* ── Drag-to-move position (shared by the panel and the chip) ── */

/**
 * Offset from the default top-centre spot, dragged with the pointer, clamped to
 * the canvas area, remembered in localStorage. `active` gates the re-fit so a
 * hidden mode never fights the visible one over the shared wrapper element.
 */
function useFloatingPosition(wrapRef: React.RefObject<HTMLDivElement | null>, storageKey: string, mode: CopilotPanelMode) {
  const active = mode !== 'closed'
  const [offset, setOffset] = useState<{ x: number; y: number }>(() => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(storageKey) : null
      if (raw) {
        const v = JSON.parse(raw)
        if (Number.isFinite(v?.x) && Number.isFinite(v?.y)) return { x: v.x, y: v.y }
      }
    } catch { /* ignore */ }
    return { x: 0, y: 0 }
  })
  const offsetRef = useRef(offset)
  useEffect(() => { offsetRef.current = offset }, [offset])
  const movedRef = useRef(false)
  const [dragging, setDragging] = useState(false)

  const clampDelta = useCallback((ddx: number, ddy: number, strict = false) => {
    const el = wrapRef.current
    const parent = el?.offsetParent as HTMLElement | null
    if (!el || !parent) return { ddx, ddy }
    const r = el.getBoundingClientRect()
    const b = parent.getBoundingClientRect()
    const margin = 8
    const minX = b.left + margin - r.left
    const maxX = b.right - margin - r.right
    const minY = b.top + margin - r.top
    // While dragging, only keep the header reachable at the bottom edge. When
    // the shape changes (minimize ⇄ open), keep the whole thing inside.
    const maxY = strict ? b.bottom - margin - r.bottom : b.bottom - 56 - r.top
    return {
      ddx: Math.min(Math.max(ddx, Math.min(minX, 0)), Math.max(maxX, 0)),
      ddy: Math.min(Math.max(ddy, minY), Math.max(maxY, minY)),
    }
  }, [wrapRef])

  const persist = useCallback((o: { x: number; y: number }) => {
    try { window.localStorage.setItem(storageKey, JSON.stringify(o)) } catch { /* ignore */ }
  }, [storageKey])

  const startDrag = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('button, a, input, textarea')) return
    e.preventDefault()
    const startX = e.clientX
    const startY = e.clientY
    const base = offsetRef.current
    const target = e.currentTarget as HTMLElement
    try { target.setPointerCapture(e.pointerId) } catch { /* ignore */ }
    movedRef.current = false
    setDragging(true)
    let last = base

    const onMove = (m: PointerEvent) => {
      if (Math.abs(m.clientX - startX) + Math.abs(m.clientY - startY) > 4) movedRef.current = true
      const want = { x: base.x + (m.clientX - startX), y: base.y + (m.clientY - startY) }
      const { ddx, ddy } = clampDelta(want.x - offsetRef.current.x, want.y - offsetRef.current.y)
      last = { x: offsetRef.current.x + ddx, y: offsetRef.current.y + ddy }
      setOffset(last)
    }
    const onUp = () => {
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', onUp)
      target.removeEventListener('pointercancel', onUp)
      setDragging(false)
      persist(last)
    }
    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', onUp)
    target.addEventListener('pointercancel', onUp)
  }, [clampDelta, persist])

  const reset = useCallback(() => {
    const z = { x: 0, y: 0 }
    setOffset(z)
    persist(z)
  }, [persist])

  /** True right after a drag, so the release doesn't also count as a click. */
  const wasDragged = useCallback(() => {
    const m = movedRef.current
    movedRef.current = false
    return m
  }, [])

  // Re-clamp when shown and when the window resizes, so a saved position from a
  // larger screen can never strand it off-canvas.
  useEffect(() => {
    if (!active) return
    const fit = () => {
      const { ddx, ddy } = clampDelta(0, 0, true)
      if (ddx || ddy) setOffset(o => ({ x: o.x + ddx, y: o.y + ddy }))
    }
    const t = setTimeout(fit, 0)
    window.addEventListener('resize', fit)
    return () => { clearTimeout(t); window.removeEventListener('resize', fit) }
  }, [active, mode, clampDelta])

  return { offset, dragging, startDrag, reset, wasDragged }
}

/* ── Window dots: close (red) + minimize (yellow) ─────── */

function WindowDots({ onClose, onMinimize }: { onClose: () => void; onMinimize?: () => void }) {
  const base = 'group/dot relative w-3 h-3 rounded-full flex items-center justify-center transition-colors duration-150 bg-white/[0.16]'
  return (
    <div className="flex items-center gap-1.5 group/dots" onDoubleClick={e => e.stopPropagation()}>
      <button
        type="button"
        onClick={onClose}
        title="Close"
        aria-label="Close Aether"
        className={`${base} group-hover/dots:bg-[#ff5f57]`}
      >
        <svg width="7" height="7" viewBox="0 0 8 8" fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth="1.4" strokeLinecap="round" className="opacity-0 group-hover/dots:opacity-100 transition-opacity">
          <path d="M1.5 1.5l5 5M6.5 1.5l-5 5"/>
        </svg>
      </button>
      {onMinimize && (
        <button
          type="button"
          onClick={onMinimize}
          title="Minimize"
          aria-label="Minimize Aether"
          className={`${base} group-hover/dots:bg-[#febc2e]`}
        >
          <svg width="7" height="7" viewBox="0 0 8 8" fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth="1.4" strokeLinecap="round" className="opacity-0 group-hover/dots:opacity-100 transition-opacity">
            <path d="M1.5 4h5"/>
          </svg>
        </button>
      )}
    </div>
  )
}

/* ── Minimized chip ───────────────────────────────────── */

function CopilotChip({
  status, dragging, onDragStart, wasDragged, onRestore, onClose, onResetPosition,
}: {
  status: AetherStatus
  dragging: boolean
  onDragStart: (e: React.PointerEvent) => void
  wasDragged: () => boolean
  onRestore: () => void
  onClose: () => void
  onResetPosition: () => void
}) {
  return (
    <div
      className={`flex items-center gap-3 pl-3.5 pr-2 h-11 rounded-full border border-white/[0.1] select-none touch-none ${dragging ? 'cursor-grabbing shadow-[0_18px_44px_rgba(0,0,0,0.55)]' : 'cursor-grab shadow-xl'} transition-shadow duration-150`}
      style={{ background: '#2a2a2e', minWidth: 300 }}
      onPointerDown={onDragStart}
      onDoubleClick={onResetPosition}
      onClick={e => {
        if ((e.target as HTMLElement).closest('button')) return
        if (!wasDragged()) onRestore()
      }}
      role="group"
      aria-label="Aivory Aether (minimized)"
      title="Drag to move · click to open"
    >
      <WindowDots onClose={onClose} />
      <AetherLogo className="h-[13px] w-auto shrink-0" />
      <span className="w-px h-4 bg-white/10 shrink-0" aria-hidden="true" />
      <span className="flex items-center gap-2 min-w-0 flex-1 text-[12px] text-[#c9c9cf] truncate" aria-live="polite">
        <StatusDot status={status} />
        <span className="truncate">{status.text}</span>
      </span>
      <button
        type="button"
        onClick={onRestore}
        title="Open"
        aria-label="Open Aether"
        className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-white/55 hover:text-white hover:bg-white/10 transition-colors"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
        </svg>
      </button>
    </div>
  )
}

/* ── Collapsed pill ───────────────────────────────────── */

function CopilotBarCollapsed({ onClick, status }: { onClick: () => void; status: AetherStatus }) {
  return (
    <button
      className="flex items-center gap-2 px-4 py-2 rounded-full bg-surface-3 border border-white/10 text-[#f7f7f7] text-[13px] font-medium cursor-pointer shadow-lg hover:border-zinc-600 hover:shadow-xl transition-all duration-150 select-none"
      onClick={onClick}
      aria-label={status.busy || status.ready ? `Open Aivory Aether — ${status.text}` : 'Open Aivory Aether'}
      title={status.busy || status.ready ? status.text : undefined}
    >
      <AetherLogo className="h-[13px] w-auto" />
      <StatusDot status={status} />
      <span className="text-[11px] text-[#a1a1aa] ml-1">/ or &#8984;K</span>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#a1a1aa] ml-0.5">
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    </button>
  )
}

/* ── Expanded floating panel ──────────────────────────── */

interface CopilotPanelExpandedProps {
  onDragStart: (e: React.PointerEvent) => void
  onResetPosition: () => void
  dragging: boolean
  onClose: () => void
  onMinimize: () => void
  messages: CopilotMessage[]
  loading: boolean
  loadingHint: string | null
  isStreamingReply: boolean
  error: string | null
  stage: string
  isTesting: boolean
  workflow: GeneratedWorkflow | null
  canApply: boolean
  isCompleted: boolean
  onSendMessage: (text: string) => Promise<void>
  onEditMessage: (index: number, newText: string) => Promise<void>
  onDeleteMessage: (index: number) => void
  onApplyWorkflow?: (workflow: GeneratedWorkflow) => void
  onClear?: () => void
  canvasTarget?: CopilotApplyTarget
  getChangePreview?: (workflow: GeneratedWorkflow) => ChangePreview | null
  isDeployed?: boolean
  /** Name of the workflow open on the canvas, when Aether can edit it. */
  canvasName?: string
}

function CopilotPanelExpanded({
  onDragStart, onResetPosition, dragging,
  onClose, onMinimize, messages, loading, loadingHint, isStreamingReply, error,
  stage, isTesting, workflow, canApply, isCompleted,
  onSendMessage, onEditMessage, onDeleteMessage, onApplyWorkflow, onClear,
  canvasTarget, canvasName, getChangePreview, isDeployed,
}: CopilotPanelExpandedProps) {
  const [input, setInput] = useState('')
  const [attachedFiles, setAttachedFiles] = useState<File[]>([])
  const [panelHeight, setPanelHeight] = useState(360)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const startHeight = panelHeight

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY
      // Constrain height between 140px and 80vh
      const newHeight = Math.max(140, Math.min(startHeight + deltaY, window.innerHeight * 0.8))
      setPanelHeight(newHeight)
    }

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 80)
  }, [])

  // Recomputed each render while the banner is up — cheap, and it reads the
  // live canvas, so a manual edit made after the proposal is reflected.
  const preview = canApply && workflow && canvasTarget && getChangePreview ? getChangePreview(workflow) : null

  const hasMessages = messages.length > 0 || loading
  const hasContent = input.trim().length > 0 || attachedFiles.length > 0
  const busy = loading || isStreamingReply

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const ta = e.target
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 180) + 'px'
  }

  const handleSend = useCallback(() => {
    const trimmed = input.trim()
    if (!hasContent || busy) return
    setInput('')
    setAttachedFiles([])
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    if (trimmed) onSendMessage(trimmed)
  }, [input, hasContent, busy, onSendMessage])

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

  const stageLabel = STAGE_LABEL

  return (
    <div
      className={`w-[520px] max-w-[90vw] min-h-0 rounded-2xl overflow-hidden flex flex-col border border-white/[0.08] ${dragging ? 'shadow-[0_28px_70px_rgba(0,0,0,0.55)]' : 'shadow-2xl'} transition-shadow duration-150`}
      style={{ background: '#2a2a2e', maxHeight: 'calc(100vh - 160px)' }}
      role="dialog"
      aria-label="Aivory Aether"
    >
      {/* ── Header ── */}
      <div
        className={`flex items-center justify-between px-5 py-3.5 border-b border-white/[0.08] shrink-0 select-none touch-none ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onPointerDown={onDragStart}
        onDoubleClick={e => { if (!(e.target as HTMLElement).closest('button')) onResetPosition() }}
        title="Drag to move · double-click to reset"
      >
        <div className="flex items-center gap-3">
          <WindowDots onClose={onClose} onMinimize={onMinimize} />
          <AetherLogo />
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
        </div>
      </div>

      {/* ── Body ── */}
      {!hasMessages ? (
        <div className="flex items-center justify-center px-6 py-8 min-h-[96px]" style={{ height: `${panelHeight}px` }}>
          <p className="text-[22px] font-normal text-[#f7f7f7] text-center tracking-tight">
            What do you want to automate?
          </p>
        </div>
      ) : (
        <div className="copilot-chat overflow-y-auto px-4 py-3 flex flex-col gap-3 min-h-[96px]" style={{ height: `${panelHeight}px` }}>
          {messages.map((msg, i) => (
            <MessageRow
              key={i}
              index={i}
              msg={msg}
              busy={busy}
              onEdit={onEditMessage}
              onDelete={onDeleteMessage}
            />
          ))}

          {loading && (
            <div className="flex items-start gap-2">
              <div className="shrink-0 mt-0.5">
                <Image src={asset("/Aivory_Avatar.svg?v=20261104")} alt="Aivory" width={16} height={16} className="w-4 h-4" />
              </div>
              <div className="flex flex-col gap-1.5 px-3 py-2 bg-white/[0.04] border border-white/5 rounded-[10px] rounded-bl-[2px]">
                <ThinkingDots size={15} dotSize={2} />
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
      {canApply && workflow && onApplyWorkflow && (
        <div className="flex flex-col gap-2 px-4 py-2.5 bg-[var(--bg-main)]/60 border-t border-zinc-600/40 shrink-0 rounded-xl mx-3 mb-2">
          {canvasTarget && preview && <ChangePreviewList preview={preview} />}
          <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col text-left">
            <span className="text-[13px] text-[#f7f7f7] font-medium">
              {canvasTarget
                ? `Changes ready for “${canvasTarget.title}”`
                : `Workflow ready — ${workflow.steps.length} steps`}
            </span>
            <span className="text-[11px] text-[#a1a1aa]">
              Validated. Setup items: {workflow.setupReport?.nodeRequirements?.length ?? 0}
            </span>
          </div>
          <button
            className="text-[13px] font-semibold px-4 py-1.5 rounded-lg bg-[#f2f2f3] text-[#1a1a1d] cursor-pointer hover:bg-white transition-colors duration-150"
            onClick={() => onApplyWorkflow(workflow)}
          >
            {canvasTarget ? (isDeployed ? 'Update & save' : 'Update canvas') : 'Apply to canvas'}
          </button>
          </div>
        </div>
      )}

      {/* ── Completed banner ── */}
      {isCompleted && !loading && (
        <div className="flex items-center px-4 py-2 bg-emerald-900/20 border-t border-emerald-700/30 shrink-0">
          <span className="text-[13px] text-emerald-400 font-medium text-left">
            {canvasTarget ? 'Canvas updated — ask for the next change anytime' : 'Workflow successfully applied to canvas'}
          </span>
        </div>
      )}

      {/* ── File preview strip ── */}
      {attachedFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 px-4 pt-3 shrink-0">
          {attachedFiles.map((file, i) => {
            const icon = getFileIcon(file.name)
            return (
              <div key={i} className="flex items-center gap-2 bg-[#35353a] border border-white/10 rounded-lg px-3 py-1.5 text-[13px] text-white/75 max-w-[180px]">
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

      {/* ── Input area — Console's one-row composer: + | message | send ── */}
      <div className="px-3 pb-2 pt-2 shrink-0">
        <div className="console-input-card w-full overflow-hidden">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            accept=".json,.txt,.csv,.pdf,.png,.jpg,.jpeg,.yaml,.yml,.env,.log"
            onChange={handleFileChange}
          />
          <div className="flex items-end gap-2 px-3 py-[10px]">
            <button
              className="console-icon-btn mb-[2px]"
              onClick={() => fileInputRef.current?.click()}
              title="Attach file"
              aria-label="Attach file"
              type="button"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14"/>
              </svg>
            </button>
            <textarea
              ref={textareaRef}
              className="console-textarea console-textarea--inline flex-1 min-w-0 text-[14px]"
              rows={1}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={canvasName ? `Ask Aether to change “${canvasName}”…` : 'Enter an idea or app name to get started'}
              disabled={busy}
              aria-label="Message Aivory"
            />
            <button
              className="console-send-btn"
              onClick={handleSend}
              disabled={!hasContent || busy}
              aria-label="Send"
              type="button"
            >
              <SendArrowIcon size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Vertical Resize Handle ── */}
      <div
        className="w-full h-3 cursor-ns-resize flex items-center justify-center hover:bg-white/[0.05] transition-colors group shrink-0"
        onMouseDown={startResize}
      >
        <div className="w-8 h-1 rounded-full bg-white/20 group-hover:bg-white/40 transition-colors" />
      </div>
    </div>
  )
}

/* ── Chat message row ─────────────────────────────────────
 * AI-chat-style rendering with hover actions: copy (all), edit (user,
 * regenerates from that turn), delete (all). Markdown output is normalized
 * so headings/lists/code never break the 13px chat typography.
 */

// Single source of truth for message typography — keeps sizes consistent
// no matter what markdown the model returns.
const MD_CLASSES = [
  'text-[13px] leading-[1.6] break-words text-left',
  '[&_h1]:text-[13px] [&_h2]:text-[13px] [&_h3]:text-[13px] [&_h4]:text-[13px]',
  '[&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_h4]:font-semibold',
  '[&_h1]:mt-2 [&_h1]:mb-1 [&_h2]:mt-2 [&_h2]:mb-1 [&_h3]:mt-1.5 [&_h3]:mb-0.5 [&_h4]:mt-1.5 [&_h4]:mb-0.5',
  '[&_p]:m-0 [&_p+p]:mt-1.5 [&_strong]:font-semibold [&_em]:italic',
  '[&_ul]:list-disc [&_ul]:pl-4 [&_ul]:my-1 [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:my-1 [&_li]:my-0.5',
  '[&_code]:bg-white/10 [&_code]:px-1 [&_code]:py-px [&_code]:rounded [&_code]:text-[12px] [&_code]:font-mono',
  '[&_pre]:bg-black/30 [&_pre]:border [&_pre]:border-white/5 [&_pre]:rounded-lg [&_pre]:p-2.5 [&_pre]:my-1.5 [&_pre]:overflow-x-auto [&_pre]:text-[12px] [&_pre_code]:bg-transparent [&_pre_code]:p-0',
  '[&_a]:underline [&_a]:text-accent',
  '[&_blockquote]:border-l-2 [&_blockquote]:border-white/15 [&_blockquote]:pl-3 [&_blockquote]:my-1 [&_blockquote]:text-white/70',
  '[&_hr]:border-white/10 [&_hr]:my-2 [&_table]:text-[12px] [&_th]:text-left [&_th]:font-semibold [&_th]:pr-3 [&_td]:pr-3',
].join(' ')

function ActionBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex items-center justify-center w-6 h-6 rounded-md text-white/35 hover:text-white/85 hover:bg-white/[0.07] transition-colors"
    >
      {children}
    </button>
  )
}

const ICONS = {
  copy: <svg width="12.5" height="12.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  check: <svg width="12.5" height="12.5" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>,
  edit: <svg width="12.5" height="12.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>,
  trash: <svg width="12.5" height="12.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>,
}

function MessageRow({
  index, msg, busy, onEdit, onDelete,
}: {
  index: number
  msg: CopilotMessage
  busy: boolean
  onEdit: (index: number, newText: string) => Promise<void>
  onDelete: (index: number) => void
}) {
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(msg.content)
  const editRef = useRef<HTMLTextAreaElement>(null)
  const isUser = msg.role === 'user'

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(msg.content)
    } catch {
      // Fallback for contexts where the async clipboard API is unavailable
      const ta = document.createElement('textarea')
      ta.value = msg.content
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } catch { /* give up silently */ }
      ta.remove()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [msg.content])

  const startEdit = useCallback(() => {
    setDraft(msg.content)
    setEditing(true)
    setTimeout(() => {
      editRef.current?.focus()
      editRef.current?.setSelectionRange(msg.content.length, msg.content.length)
    }, 40)
  }, [msg.content])

  const submitEdit = useCallback(() => {
    const trimmed = draft.trim()
    if (!trimmed || busy) return
    setEditing(false)
    if (trimmed !== msg.content.trim()) onEdit(index, trimmed)
  }, [draft, busy, msg.content, onEdit, index])

  // ── Inline edit mode (user messages) ──
  if (editing) {
    return (
      <div className="flex justify-end">
        <div className="w-[85%] flex flex-col gap-1.5">
          <textarea
            ref={editRef}
            className="w-full bg-black/25 border border-white/15 rounded-xl px-3 py-2 text-[13px] leading-[1.6] text-[#f7f7f7] resize-none outline-none focus:border-accent/50 min-h-[60px]"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitEdit() }
              if (e.key === 'Escape') setEditing(false)
            }}
            rows={2}
            aria-label="Edit message"
          />
          <div className="flex items-center justify-end gap-2">
            <span className="text-[10px] text-white/30 mr-auto">Regenerates the conversation from this turn</span>
            <button
              type="button"
              className="text-[11px] font-medium px-3 py-1 rounded-lg text-white/60 hover:text-white/90 border border-white/10 hover:border-white/25 transition-colors"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="text-[11px] font-semibold px-3 py-1 rounded-lg bg-[#f2f2f3] text-[#1a1a1d] hover:bg-white transition-colors disabled:opacity-45"
              onClick={submitEdit}
              disabled={!draft.trim() || busy}
            >
              Send
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Assistant message: avatar + open content, actions on hover ──
  if (!isUser) {
    return (
      <div className="group flex items-start gap-2.5">
        <div className="shrink-0 mt-1">
          <Image src={asset("/Aivory_Avatar.svg?v=20261104")} alt="Aivory" width={18} height={18} className="w-[18px] h-[18px]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className={`${MD_CLASSES} text-[#ecebe7]`}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
            {msg.isStreaming && (
              <span
                className="inline-block w-[3px] h-[1.125rem] bg-accent ml-0.5 align-middle rounded-sm"
                style={{ animation: 'blink 1s step-end infinite' }}
                aria-hidden="true"
              />
            )}
          </div>
          <div className="flex items-center gap-0.5 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <ActionBtn label={copied ? 'Copied' : 'Copy'} onClick={handleCopy}>{copied ? ICONS.check : ICONS.copy}</ActionBtn>
            <ActionBtn label="Delete message" onClick={() => onDelete(index)}>{ICONS.trash}</ActionBtn>
          </div>
        </div>
      </div>
    )
  }

  // ── User message: right-aligned bubble, actions on hover ──
  return (
    <div className="group flex flex-col items-end">
      <div className="max-w-[85%] bg-[#1f1f22] border border-white/[0.06] rounded-2xl rounded-br-md px-3.5 py-2">
        <p className="m-0 text-[13px] leading-[1.6] text-[#f7f7f7] whitespace-pre-wrap break-words text-left">
          {msg.content}
        </p>
      </div>
      <div className="flex items-center gap-0.5 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <ActionBtn label={copied ? 'Copied' : 'Copy'} onClick={handleCopy}>{copied ? ICONS.check : ICONS.copy}</ActionBtn>
        {!busy && <ActionBtn label="Edit and resend" onClick={startEdit}>{ICONS.edit}</ActionBtn>}
        <ActionBtn label="Delete message" onClick={() => onDelete(index)}>{ICONS.trash}</ActionBtn>
      </div>
    </div>
  )
}

/* ── Change preview (edit mode) ───────────────────────── */

function ChangePreviewList({ preview }: { preview: ChangePreview }) {
  const summary = [
    preview.added ? `${preview.added} added` : '',
    preview.removed ? `${preview.removed} removed` : '',
    preview.renamed ? `${preview.renamed} renamed` : '',
    `${preview.kept} kept`,
  ].filter(Boolean).join(', ')

  return (
    <div className="flex flex-col gap-1 text-left" data-testid="aether-change-preview">
      <span className="text-[11px] uppercase tracking-wide text-[#a1a1aa]">Changes · {summary}</span>
      <ul className="m-0 p-0 list-none max-h-[132px] overflow-y-auto [scrollbar-width:thin] flex flex-col gap-0.5">
        {preview.changes.map((c, i) => (
          <li
            key={`${c.kind}-${i}-${c.title}`}
            style={{ paddingLeft: c.depth * 14 }}
            className={
              'text-[12px] leading-snug flex gap-1.5 ' +
              (c.kind === 'added' ? 'text-emerald-400'
                : c.kind === 'removed' ? 'text-red-400 line-through'
                : c.kind === 'renamed' ? 'text-[#a1a1aa]'
                : 'text-white/40')
            }
          >
            <span className="w-3 shrink-0 no-underline" aria-hidden="true">
              {c.kind === 'added' ? '+' : c.kind === 'removed' ? '−' : c.kind === 'renamed' ? '~' : ''}
            </span>
            <span className="min-w-0 break-words">
              {c.title}
              {c.kind === 'renamed' && c.from ? <span className="text-white/30"> (was {c.from})</span> : null}
            </span>
          </li>
        ))}
      </ul>
      {preview.removed > 0 && (
        <span className="text-[11px] text-red-400/90">
          {preview.removed === 1 ? '1 step will be deleted' : `${preview.removed} steps will be deleted`} — you can Undo on the canvas.
        </span>
      )}
    </div>
  )
}
