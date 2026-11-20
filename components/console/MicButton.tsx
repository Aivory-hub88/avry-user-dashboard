"use client"

import { useVoiceInput } from "@/hooks/useVoiceInput"

interface MicButtonProps {
  /** Receives the transcript; the composer appends it to the draft. */
  onText: (text: string) => void
  onError?: (message: string) => void
  disabled?: boolean
  className?: string
}

/** Speech-to-prompt toggle: click to record, click again to transcribe. */
export default function MicButton({ onText, onError, disabled, className = "console-icon-btn" }: MicButtonProps) {
  const { state, supported, start, stop } = useVoiceInput(onText, onError)
  if (!supported) return null

  const recording = state === "recording"
  const busy = state === "transcribing"

  return (
    <button
      type="button"
      className={className}
      onClick={recording ? stop : start}
      disabled={disabled || busy}
      aria-label={recording ? "Stop recording" : busy ? "Transcribing" : "Speak your prompt"}
      title={recording ? "Stop and transcribe" : busy ? "Transcribing…" : "Speak your prompt"}
      style={recording ? { color: "#f87171" } : undefined}
    >
      {busy ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="animate-spin">
          <path d="M21 12a9 9 0 1 1-6.2-8.55" />
        </svg>
      ) : recording ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="animate-pulse">
          <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v4" />
        </svg>
      )}
    </button>
  )
}
