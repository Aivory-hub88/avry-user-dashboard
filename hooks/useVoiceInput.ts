"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createSpeechMeter, rmsOf } from "@/lib/voiceActivity"

export type VoiceState = "idle" | "recording" | "transcribing"

/** Hard stop so a forgotten open mic can't run (or bill) forever. */
const MAX_RECORD_MS = 120_000
/** Level sampling while recording (see lib/voiceActivity). */
const METER_INTERVAL_MS = 50

/**
 * Mono voice capture with the browser's own cleanup on: noise suppression and
 * echo cancellation cut the fan/room hum that makes Whisper mishear words, and
 * automatic gain evens out a quiet or distant speaker.
 */
const MIC_CONSTRAINTS: MediaTrackConstraints = {
  channelCount: 1,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(t)) return t
  }
  return undefined
}

function extFor(mime: string): string {
  if (mime.includes("mp4")) return "m4a"
  if (mime.includes("ogg")) return "ogg"
  return "webm"
}

/** Sample the mic level into a speech meter. null if Web Audio is unavailable. */
function startMeter(
  stream: MediaStream,
  stopRef: { current: (() => void) | null },
): ReturnType<typeof createSpeechMeter> | null {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return null
    const ctx = new Ctx()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    ctx.createMediaStreamSource(stream).connect(analyser)
    const buf = new Float32Array(analyser.fftSize)
    const meter = createSpeechMeter()
    const id = setInterval(() => {
      analyser.getFloatTimeDomainData(buf)
      meter.push(rmsOf(buf))
    }, METER_INTERVAL_MS)
    stopRef.current = () => {
      clearInterval(id)
      void ctx.close().catch(() => {})
    }
    return meter
  } catch {
    return null
  }
}

/**
 * Speech-to-prompt: record from the mic, send the clip to /api/console/transcribe,
 * hand the transcript to `onText`. The caller decides where it goes (the composer
 * appends it to the draft so the user can edit before sending).
 */
export function useVoiceInput(onText: (text: string) => void, onError?: (message: string) => void) {
  const [state, setState] = useState<VoiceState>("idle")
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelledRef = useRef(false)
  const meterRef = useRef<ReturnType<typeof createSpeechMeter> | null>(null)
  const meterStopRef = useRef<(() => void) | null>(null)
  // Latest callbacks without re-creating start/stop on every render.
  const cbRef = useRef({ onText, onError })
  useEffect(() => {
    cbRef.current = { onText, onError }
  })

  const supported =
    typeof window !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined"

  const release = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    meterStopRef.current?.()
    meterStopRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const stop = useCallback(() => {
    const rec = recorderRef.current
    if (rec && rec.state !== "inactive") rec.stop()
  }, [])

  const start = useCallback(async () => {
    if (state !== "idle") return
    if (!supported) {
      cbRef.current.onError?.("Voice input isn't supported in this browser.")
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: MIC_CONSTRAINTS })
      streamRef.current = stream
      const mimeType = pickMimeType()
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      recorderRef.current = rec
      chunksRef.current = []
      cancelledRef.current = false
      meterRef.current = startMeter(stream, meterStopRef)

      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      rec.onstop = async () => {
        const meter = meterRef.current
        meterRef.current = null
        release()
        const type = rec.mimeType || mimeType || "audio/webm"
        const blob = new Blob(chunksRef.current, { type })
        chunksRef.current = []
        if (cancelledRef.current || blob.size === 0) {
          setState("idle")
          return
        }
        // Nothing but silence or hum: don't pay to transcribe it (Whisper tends
        // to invent a phrase from silence). If the meter couldn't start, send.
        if (meter && !meter.heardSpeech()) {
          cbRef.current.onError?.("Didn't hear anything — check your microphone and try again.")
          setState("idle")
          return
        }
        setState("transcribing")
        try {
          const form = new FormData()
          form.append("file", blob, `voice.${extFor(type)}`)
          const res = await fetch("/api/console/transcribe", { method: "POST", body: form })
          const data = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(data?.error || "Transcription failed")
          const text = String(data?.text ?? "").trim()
          if (text) cbRef.current.onText(text)
          else cbRef.current.onError?.("Didn't catch anything — try again.")
        } catch (err) {
          cbRef.current.onError?.(err instanceof Error ? err.message : "Transcription failed")
        } finally {
          setState("idle")
        }
      }

      rec.start()
      setState("recording")
      timerRef.current = setTimeout(stop, MAX_RECORD_MS)
    } catch (err) {
      release()
      setState("idle")
      const denied = err instanceof DOMException && err.name === "NotAllowedError"
      cbRef.current.onError?.(
        denied ? "Microphone access was blocked." : "Couldn't start the microphone.",
      )
    }
  }, [state, supported, release, stop])

  // Navigating away mid-recording: drop the clip, free the mic.
  useEffect(
    () => () => {
      cancelledRef.current = true
      const rec = recorderRef.current
      if (rec && rec.state !== "inactive") rec.stop()
      release()
    },
    [release],
  )

  return { state, supported, start, stop }
}
