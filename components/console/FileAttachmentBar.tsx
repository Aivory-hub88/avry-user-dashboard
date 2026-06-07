'use client'

import React from 'react'

interface FileAttachmentBarProps {
  filename: string
  action: 'read' | 'written' | 'created'
}

const actionColors: Record<FileAttachmentBarProps['action'], string> = {
  read: 'bg-blue-500/20 text-blue-400',
  written: 'bg-amber-500/20 text-amber-400',
  created: 'bg-emerald-500/20 text-emerald-400',
}

export default function FileAttachmentBar({ filename, action }: FileAttachmentBarProps) {
  return (
    <div className="flex items-center gap-2 bg-[#6A6A6A]/20 rounded-lg py-3 px-4 text-xs">
      {/* Document outline SVG icon */}
      <svg
        width={16}
        height={16}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="flex-shrink-0 text-[#a1a1aa]"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>

      {/* Filename as safe React text children */}
      <span className="font-mono text-zinc-300 truncate">{filename}</span>

      {/* Action badge pill */}
      <span className={`ml-auto flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${actionColors[action]}`}>
        {action}
      </span>
    </div>
  )
}
