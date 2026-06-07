"use client"

import React, { useMemo } from 'react'
import Image from 'next/image'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface ChatMessageCompactProps {
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
}

function normalizeMarkdown(text: string): string {
  return text.replace(/\n(?!\n)(?![-*+>|#`\d])/g, '\n\n')
}

const ListTypeContext = React.createContext<'ul' | 'ol'>('ul')

const compactMarkdownComponents = {
  p: ({ children }: any) => (
    <p className="text-[13px] leading-[1.55] mb-2.5 text-[#f7f7f7] last:mb-0">
      {children}
    </p>
  ),
  h1: ({ children }: any) => (
    <h1 className="text-sm font-semibold mb-2 text-zinc-100">{children}</h1>
  ),
  h2: ({ children }: any) => (
    <h2 className="text-sm font-semibold mb-2 mt-3 text-zinc-100 first:mt-0">{children}</h2>
  ),
  h3: ({ children }: any) => (
    <h3 className="text-[13px] font-semibold mb-1.5 mt-3 text-zinc-100 first:mt-0">{children}</h3>
  ),
  strong: ({ children }: any) => (
    <strong className="font-semibold text-zinc-100">{children}</strong>
  ),
  em: ({ children }: any) => (
    <em className="italic text-[#f7f7f7]">{children}</em>
  ),
  a: ({ href, children }: any) => (
    <a href={href} className="text-[#00e59e] hover:text-[#00e59e]/80 underline underline-offset-2 transition-colors text-[13px]" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  ul: ({ children }: any) => (
    <ListTypeContext.Provider value="ul">
      <ul className="my-2 ml-0 list-none space-y-1">{children}</ul>
    </ListTypeContext.Provider>
  ),
  ol: ({ children }: any) => (
    <ListTypeContext.Provider value="ol">
      <ol className="my-2 ml-4 list-decimal space-y-1">{children}</ol>
    </ListTypeContext.Provider>
  ),
  li: ({ children }: any) => {
    const listType = React.useContext(ListTypeContext)
    return (
      <li className="text-[13px] text-[#f7f7f7] leading-[1.55] flex items-start gap-2">
        {listType === 'ul' && (
          <span className="text-[#a1a1aa] mt-[7px] shrink-0 text-[5px]">●</span>
        )}
        <span className="flex-1">{children}</span>
      </li>
    )
  },
  code: ({ inline, className, children }: any) => {
    if (inline) {
      return (
        <code className="bg-white/10 text-pink-400 px-1 py-0.5 rounded text-[12px] font-mono border border-white/10">
          {children}
        </code>
      )
    }
    return (
      <pre className="my-2 rounded-lg bg-[#1e1e1e] border border-white/10 p-3 overflow-x-auto">
        <code className="text-[12px] font-mono text-[#f7f7f7] leading-relaxed">
          {String(children).replace(/\n$/, '')}
        </code>
      </pre>
    )
  },
  blockquote: ({ children }: any) => (
    <blockquote className="my-2 pl-3 border-l-2 border-[#00e59e]/40 text-[#a1a1aa] italic text-[13px]">
      {children}
    </blockquote>
  ),
}

export default function ChatMessageCompact({
  role,
  content,
  isStreaming = false,
}: ChatMessageCompactProps) {
  const normalizedContent = useMemo(() => normalizeMarkdown(content), [content])

  return (
    <div className="mb-4">
      {role === 'user' ? (
        <div className="flex justify-end">
          <div className="max-w-[85%] bg-[#282825] rounded-xl px-3.5 py-2.5 text-[13px] text-white/85 leading-[1.55] border border-white/[0.06]">
            {content}
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2.5">
          <div className="w-6 h-6 rounded-full flex-shrink-0 mt-0.5 flex items-center justify-center bg-[#00e59e]/15 border border-[#00e59e]/20">
            <Image src="/Aivory_Avatar.svg" alt="Aivory" width={13} height={13} />
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            {isStreaming && !content && (
              <div className="flex items-center gap-1.5">
                <span className="flex gap-1">
                  {[0, 150, 300].map((delay) => (
                    <span
                      key={delay}
                      className="w-1 h-1 rounded-full bg-[#a1a1aa] animate-bounce"
                      style={{ animationDelay: `${delay}ms`, animationDuration: '1s' }}
                    />
                  ))}
                </span>
                <span className="text-[12px] text-[#a1a1aa]">thinking...</span>
              </div>
            )}
            {content && (
              <div>
                {isStreaming ? (
                  <p className="text-[13px] leading-[1.55] text-[#f7f7f7] whitespace-pre-wrap">
                    {content}
                    <span
                      className="inline-block w-[2px] h-[13px] bg-[#00e59e] ml-0.5 align-middle rounded-sm"
                      style={{ animation: 'blink 1s step-end infinite' }}
                      aria-hidden="true"
                    />
                  </p>
                ) : (
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={compactMarkdownComponents}>
                    {normalizedContent}
                  </ReactMarkdown>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
