"use client"

import { useEffect, useRef } from "react"
import { useVoiceInput } from "@/hooks/useVoiceInput"
import MicWaveform from "./MicWaveform"

/** Held shorter than this = accidental tap, the clip is dropped. */
const MIN_HOLD_MS = 350
/**
 * Hold-to-talk: hold Fn (Globe on newer Macs), release to transcribe. A web page
 * only sees Fn if the browser and keyboard report it, so Option+Space is kept as
 * a fallback that always works.
 */
type HoldKey = "fn" | "alt"
const holdKeyOf = (e: KeyboardEvent): HoldKey | null => {
  if (e.key === "Fn" || e.key === "Globe" || e.code === "Fn") return "fn"
  if (e.code === "Space" && e.altKey) return "alt"
  return null
}
const releasesHold = (e: KeyboardEvent, held: HoldKey) =>
  held === "fn" ? holdKeyOf(e) === "fn" : e.code === "Space" || e.key === "Alt"

interface MicButtonProps {
  /** Receives the transcript; the composer appends it to the draft. */
  onText: (text: string) => void
  onError?: (message: string) => void
  disabled?: boolean
  className?: string
}

/** Speech-to-prompt: click to record/stop, or hold Fn to talk. */
export default function MicButton({ onText, onError, disabled, className = "console-icon-btn" }: MicButtonProps) {
  const { state, supported, start, stop, cancel, getLevel } = useVoiceInput(onText, onError)

  // Latest values for the window listeners, which are bound once.
  const live = useRef({ start, stop, cancel, state, disabled })
  useEffect(() => {
    live.current = { start, stop, cancel, state, disabled }
  })

  useEffect(() => {
    if (!supported) return
    let heldSince = 0
    let heldBy: HoldKey | null = null
    const release = () => {
      if (!heldSince) return
      const heldFor = Date.now() - heldSince
      heldSince = 0
      heldBy = null
      if (heldFor < MIN_HOLD_MS) live.current.cancel()
      else live.current.stop()
    }
    const onDown = (e: KeyboardEvent) => {
      const key = holdKeyOf(e)
      if (!key) return
      e.preventDefault()
      if (e.repeat || heldSince) return
      const { state: st, disabled: off } = live.current
      if (off || st !== "idle") return
      heldSince = Date.now()
      heldBy = key
      void live.current.start()
    }
    const onUp = (e: KeyboardEvent) => {
      if (heldBy && releasesHold(e, heldBy)) release()
    }
    window.addEventListener("keydown", onDown)
    window.addEventListener("keyup", onUp)
    window.addEventListener("blur", release)
    return () => {
      window.removeEventListener("keydown", onDown)
      window.removeEventListener("keyup", onUp)
      window.removeEventListener("blur", release)
    }
  }, [supported])

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
      title={recording ? "Stop and transcribe" : busy ? "Transcribing…" : "Speak your prompt (hold Fn)"}
      style={recording ? { color: "#f87171", width: "auto", gap: 8, paddingInline: 10 } : undefined}
    >
      {busy ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="animate-spin">
          <path d="M21 12a9 9 0 1 1-6.2-8.55" />
        </svg>
      ) : recording ? (
        <>
          <MicWaveform getLevel={getLevel} />
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        </>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v4" />
        </svg>
      )}
    </button>
  )
}
