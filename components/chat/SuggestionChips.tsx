"use client"

import React from 'react'

interface SuggestionChipsProps {
  suggestions: string[]
  onSelect: (text: string) => void
}

/**
 * SuggestionChips — horizontal pill buttons rendered below AI responses.
 * Each chip displays a small sparkle icon + label text.
 * Clicking a chip calls onSelect with the exact label string.
 */
export default function SuggestionChips({ suggestions, onSelect }: SuggestionChipsProps) {
  if (suggestions.length === 0) return null

  return (
    <div
      className="flex flex-wrap gap-2 pt-3 animate-fadeSlideUp"
      aria-label="Suggested actions"
    >
      {suggestions.map((label) => (
        <button
          key={label}
          type="button"
          onClick={() => onSelect(label)}
          className="
            inline-flex items-center gap-1.5
            px-4 py-2
            rounded-[20px]
            bg-transparent
            border border-white/10
            text-[13px] font-medium text-white/70
            cursor-pointer
            transition-all duration-150
            hover:text-[#2dd4a0] hover:border-[#2dd4a0] hover:bg-white/5
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2dd4a0]/50 focus-visible:ring-offset-1 focus-visible:ring-offset-[#353531]
          "
        >
          {/* Sparkle icon */}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 3v1m0 16v1m-7.07-2.93l.71-.71M18.36 5.64l.71-.71M3 12h1m16 0h1M5.64 5.64l-.71-.71m12.73 12.73l.71.71" />
          </svg>
          {label}
        </button>
      ))}
    </div>
  )
}
