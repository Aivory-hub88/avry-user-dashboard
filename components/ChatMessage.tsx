"use client"

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import Image from 'next/image'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { AgenticWorkflowState } from '@/types/agenticWorkflow'
import WorkflowContainer from '@/components/console/WorkflowContainer'
import MessageActions from './chat/MessageActions'
import { RoutingSuggestBanner } from './chat/RoutingSuggestBanner'
import { AttachmentCard } from '@/components/AttachmentCard'
import type { Attachment } from '@/components/UploadMenu'
import type { ClassifiedIntent } from '@/lib/intentClassifier'

interface ChatMessageProps {
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
  agenticState?: AgenticWorkflowState | null
  onRegenerate?: () => void
  onEdit?: () => void
  pendingRoute?: ClassifiedIntent
  onAcceptRoute?: () => void
  onDismissRoute?: () => void
  attachments?: Attachment[]
}

/**
 * Normalizes plain-text LLM output so ReactMarkdown renders proper paragraphs.
 * Single newlines become double newlines (markdown paragraph breaks).
 * Already-doubled newlines are preserved.
 */
function normalizeMarkdown(text: string): string {
  return text.replace(/\n(?!\n)(?![-*+>|#`\d])/g, '\n\n')
}

/* ── Code block with syntax highlighting (lazy-loaded) ─────────────────────── */

interface CodeBlockProps {
  inline?: boolean
  className?: string
  children?: React.ReactNode
}

function CodeBlock({ inline, className, children, ...props }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)
  const [Highlighter, setHighlighter] = useState<any>(null)
  const [highlightStyle, setHighlightStyle] = useState<any>(null)
  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => {
    Promise.all([
      import('react-syntax-highlighter').then(m => m.Prism),
      import('react-syntax-highlighter/dist/esm/styles/prism').then(m => m.vscDarkPlus),
    ]).then(([hl, style]) => {
      setHighlighter(() => hl)
      setHighlightStyle(style)
    }).catch(() => {
      setLoadFailed(true)
    })
  }, [])

  const match = /language-(\w+)/.exec(className || '')
  const language = match ? match[1] : ''
  const code = String(children).replace(/\n$/, '')

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      try {
        const el = document.createElement('textarea')
        el.value = code
        el.style.cssText = 'position:fixed;opacity:0'
        document.body.appendChild(el)
        el.select()
        document.execCommand('copy')
        document.body.removeChild(el)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch {
        console.error('Copy failed')
      }
    }
  }, [code])

  if (inline) {
    return (
      <code className="bg-white/8 text-pink-400 px-1.5 py-0.5 rounded border border-white/10 font-mono text-[0.875rem]">
        {children}
      </code>
    )
  }

  return (
    <div className="my-5 rounded-xl overflow-hidden bg-[#1E1E1E] border border-[#E5E7EB]/10">
      <div className="flex justify-between items-center px-5 py-2.5 bg-[#2d2d2d] border-b border-[#E5E7EB]/10">
        <span className="text-xs text-[#a1a1aa] font-mono uppercase tracking-wider">{language || 'code'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[#a1a1aa] hover:text-[#f7f7f7] hover:bg-white/5 transition-all duration-150 text-xs"
          aria-label="Copy code"
        >
          {copied ? (
            <>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path d="M13.5 4L6 11.5L2.5 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>Copied</span>
            </>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M3 11V3C3 2.44772 3.44772 2 4 2H10" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      {Highlighter && highlightStyle && !loadFailed ? (
        <Highlighter
          language={language}
          style={highlightStyle}
          customStyle={{
            margin: 0,
            borderRadius: '0 0 12px 12px',
            fontSize: '0.875rem',
            lineHeight: '1.6',
            padding: '1.25rem',
            background: '#1E1E1E',
          }}
        >
          {code}
        </Highlighter>
      ) : (
        <pre className="m-0 rounded-b-xl text-[0.875rem] leading-relaxed p-5 bg-[#1E1E1E] overflow-x-auto">
          <code>{code}</code>
        </pre>
      )}
    </div>
  )
}

/* ── Manus Design System — ReactMarkdown components ────────────────────────── */
/* Typography: 8px grid, 16px base, Inter font stack                           */
/* Spacing: paragraph gap 1.25rem, section gap 2.5rem                          */

const ListTypeContext = React.createContext<'ul' | 'ol'>('ul')

const markdownComponents = {
  code: CodeBlock as any,

  // H1: 1.875rem (30px), weight 700, mb-6
  h1: ({ children }: any) => (
    <h1 className="text-[1.875rem] font-bold mb-6 text-zinc-100 leading-tight tracking-tight first:mt-0">
      {children}
    </h1>
  ),
  // H2: 1.5rem (24px), weight 600, mt-8, mb-4
  h2: ({ children }: any) => (
    <h2 className="text-2xl font-semibold mt-8 mb-4 text-zinc-100 leading-tight tracking-tight first:mt-0">
      {children}
    </h2>
  ),
  // H3: 1.25rem (20px), weight 600, mt-6, mb-3
  h3: ({ children }: any) => (
    <h3 className="text-xl font-semibold mt-6 mb-3 text-zinc-100 leading-snug first:mt-0">
      {children}
    </h3>
  ),
  h4: ({ children }: any) => (
    <h4 className="text-[1rem] font-semibold text-[#f7f7f7] mt-4 mb-2 leading-snug first:mt-0">
      {children}
    </h4>
  ),

  // Body: 1rem (16px), line-height 1.6, paragraph gap mb-4
  p: ({ children }: any) => (
    <p className="text-base leading-[1.6] mb-4 text-[#f7f7f7] last:mb-0">
      {children}
    </p>
  ),

  strong: ({ children }: any) => (
    <strong className="font-semibold text-zinc-100">{children}</strong>
  ),

  em: ({ children }: any) => (
    <em className="italic text-[#f7f7f7]">{children}</em>
  ),

  a: ({ href, children }: any) => (
    <a href={href} className="text-[#00e59e] hover:text-[#00e59e]/80 underline underline-offset-2 transition-colors" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),

  // Lists — my-4 container, mb-2 per item
  ul: ({ children }: any) => (
    <ListTypeContext.Provider value="ul">
      <ul className="my-4 ml-1 list-none">{children}</ul>
    </ListTypeContext.Provider>
  ),
  ol: ({ children }: any) => (
    <ListTypeContext.Provider value="ol">
      <ol className="my-4 ml-1 list-decimal list-inside">{children}</ol>
    </ListTypeContext.Provider>
  ),
  li: ({ children }: any) => {
    const listType = React.useContext(ListTypeContext)
    return (
      <li className="mb-2 text-base text-[#f7f7f7] leading-[1.6] flex items-start gap-2.5">
        {listType === 'ul' && <span className="text-[#a1a1aa] mt-[9px] shrink-0 text-[6px]">●</span>}
        <span className="flex-1">{children}</span>
      </li>
    )
  },

  blockquote: ({ children }: any) => (
    <blockquote className="my-5 pl-4 border-l-2 border-[#00e59e]/40 text-[#a1a1aa] italic">
      {children}
    </blockquote>
  ),

  // Tables — border border-[#E5E7EB]/10, header bg-white/4, cells px-4 py-3
  table: ({ children }: any) => (
    <div className="my-5 overflow-x-auto rounded-xl border border-[#E5E7EB]/10">
      <table className="w-full text-sm border-collapse">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }: any) => (
    <thead className="bg-white/4">
      {children}
    </thead>
  ),
  th: ({ children }: any) => (
    <th className="px-4 py-3 text-left text-xs font-semibold text-[#a1a1aa] uppercase tracking-wider border-b border-[#E5E7EB]/10">
      {children}
    </th>
  ),
  td: ({ children }: any) => (
    <td className="px-4 py-3 text-[0.875rem] text-[#f7f7f7] border-b border-[#E5E7EB]/5">
      {children}
    </td>
  ),

  hr: () => (
    <hr className="my-8 border-0 border-t border-[#E5E7EB]/10" />
  ),
}

/* ── Main component ────────────────────────────────────────────────────────── */

export default function ChatMessage({ role, content, isStreaming = false, agenticState, onRegenerate, onEdit, pendingRoute, onAcceptRoute, onDismissRoute, attachments }: ChatMessageProps) {
  const noop = useCallback(() => {}, [])
  const hasAgenticPhases = !!(agenticState && agenticState.phases.length > 0)
  const hasTextContent = !!content
  const normalizedContent = useMemo(() => normalizeMarkdown(content), [content])

  return (
    <div className="mb-8">
      {role === 'user' ? (
        /* USER BUBBLE — right-aligned, subtle container */
        <div className="flex justify-end group relative">
          <div className="max-w-[80%] bg-[#282825] rounded-2xl px-5 py-3.5 text-base text-white leading-[1.6] border border-[#E5E7EB]/5 shadow-[0_1px_3px_0_rgb(0_0_0/0.1),0_1px_2px_-1px_rgb(0_0_0/0.1)] text-left">
            {attachments && attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {attachments.map((att, i) => (
                  <AttachmentCard
                    key={i}
                    attachment={att}
                    onRemove={() => {}}
                    readOnly={true}
                  />
                ))}
              </div>
            )}
            {content}
          </div>
          <MessageActions role="user" content={content} onEdit={onEdit} />
        </div>
      ) : (
        /* AI MESSAGE — avatar + clean Manus typography */
        <>
        <div className="flex items-start gap-4 group relative">
          {/* Avatar */}
          <div className="w-9 h-9 rounded-full flex-shrink-0 mt-0.5 flex items-center justify-center bg-accent/20">
            <Image
              src="/Aivory_Avatar.svg"
              alt="Aivory"
              width={18}
              height={18}
            />
          </div>

          {/* Message content — max-w-[800px] for readability */}
          <div className="flex-1 px-1 py-1 text-base text-[#f7f7f7] leading-[1.6] min-w-0 max-w-[800px] text-left">
            {/* Thinking indicator */}
            {isStreaming && !content && !hasAgenticPhases && (
              <div className="flex items-center gap-2">
                <span className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#a1a1aa] animate-bounce"
                        style={{ animationDelay: '0ms', animationDuration: '1s' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#a1a1aa] animate-bounce"
                        style={{ animationDelay: '150ms', animationDuration: '1s' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#a1a1aa] animate-bounce"
                        style={{ animationDelay: '300ms', animationDuration: '1s' }} />
                </span>
                <span className="text-sm text-[#a1a1aa]">Aivory is thinking...</span>
              </div>
            )}

            {/* Agentic workflow container */}
            {hasAgenticPhases && (
              <div className={hasTextContent ? 'mb-4' : ''}>
                <WorkflowContainer
                  phases={agenticState!.phases}
                  isComplete={agenticState!.isComplete}
                />
              </div>
            )}

            {/* Rendered markdown content */}
            {hasTextContent && (
              <div className="prose-aivory">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={markdownComponents}
                >
                  {normalizedContent}
                </ReactMarkdown>
                {/* Streaming cursor — brand color blinking bar */}
                {isStreaming && (
                  <span
                    className="inline-block w-[3px] h-[1.125rem] bg-[#00e59e] ml-0.5 align-middle rounded-sm"
                    style={{ animation: 'blink 1s step-end infinite' }}
                    aria-hidden="true"
                  />
                )}
              </div>
            )}
          </div>
          <MessageActions role="ai" content={content} onRegenerate={onRegenerate} />
        </div>
        {/* Intent routing banner - sits below the message full-width */}
        {pendingRoute && (
          <div className="mt-2">
            <RoutingSuggestBanner 
              intent={pendingRoute} 
              onAccept={onAcceptRoute ?? noop} 
              onDismiss={onDismissRoute ?? noop} 
            />
          </div>
        )}
        </>
      )}
    </div>
  )
}
