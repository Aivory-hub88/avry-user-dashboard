"use client"

import React from 'react'

interface ActionItem {
  label: string
  icon?: React.ReactNode
}

interface ActionListProps {
  items: ActionItem[]
  onSelect: (text: string) => void
}

/**
 * ActionList — full-width vertically stacked numbered action cards.
 * Shown on empty chat state (static actions) or when AI requests clarification.
 * Each card: number badge (left), action text (center), chevron-right arrow (right).
 */
export default function ActionList({ items, onSelect }: ActionListProps) {
  if (items.length === 0) return null

  return (
    <div className="flex flex-col gap-2 w-full animate-fadeSlideUp" role="list">
      {items.map((item, index) => (
        <button
          key={item.label}
          type="button"
          role="listitem"
          onClick={() => onSelect(item.label)}
          className="
            group
            flex items-center gap-4
            w-full
            px-4 py-3.5
            bg-[#2d2d2a]
            border border-white/10
            rounded-lg
            text-left
            cursor-pointer
            transition-all duration-150
            hover:border-[#2dd4a0]/30
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2dd4a0]/50 focus-visible:ring-offset-1 focus-visible:ring-offset-[#353531]
          "
        >
          {/* Number badge */}
          <span
            className="
              flex items-center justify-center
              w-7 h-7 min-w-[28px]
              rounded-full
              border border-white/15
              text-[12px] font-semibold text-white/60
              transition-all duration-150
              group-hover:bg-[#2dd4a0] group-hover:border-[#2dd4a0] group-hover:text-[#1a1a18]
            "
          >
            {index + 1}
          </span>

          {/* Action text */}
          <span
            className="
              flex-1
              text-[14px] font-medium text-white/80
              transition-colors duration-150
              group-hover:text-[#2dd4a0]
            "
          >
            {item.label}
          </span>

          {/* Chevron-right arrow */}
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="
              text-white/40
              transition-all duration-150
              group-hover:text-[#2dd4a0] group-hover:translate-x-[3px]
            "
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      ))}
    </div>
  )
}
