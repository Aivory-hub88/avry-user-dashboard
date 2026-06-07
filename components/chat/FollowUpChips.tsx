"use client"

interface FollowUpChipsProps {
  suggestions: string[]
  onSelect: (suggestion: string) => void
}

export default function FollowUpChips({ suggestions, onSelect }: FollowUpChipsProps) {
  if (suggestions.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2 px-4 pt-2 pb-3">
      {suggestions.map((suggestion) => (
        <button
          key={suggestion}
          onClick={() => onSelect(suggestion)}
          className="border border-white/10 rounded-full px-3 py-1.5 text-xs text-white/50 hover:bg-green-900/20 hover:border-green-700/40 hover:text-white/80 transition-colors duration-150"
        >
          {suggestion}
        </button>
      ))}
    </div>
  )
}
