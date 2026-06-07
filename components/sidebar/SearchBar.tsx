"use client"
import { useRef, useEffect } from "react"
import { Search, X } from "lucide-react"

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
}

export default function SearchBar({ value, onChange }: SearchBarProps) {
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }
    timerRef.current = setTimeout(() => {
      onChange(newValue)
    }, 300)
  }

  const handleClear = () => {
    onChange("")
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-white/[0.05] border border-white/[0.07] mx-2 mb-1">
      <Search className="w-3.5 h-3.5 text-white/25 shrink-0" />
      <input
        type="text"
        value={value}
        onChange={handleChange}
        placeholder="Search conversations..."
        className="flex-1 bg-transparent text-xs text-white/80 placeholder:text-white/25 outline-none"
      />
      {value && (
        <button
          onClick={handleClear}
          className="w-3.5 h-3.5 text-white/25 hover:text-white/60 cursor-pointer transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}
