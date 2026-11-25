/**
 * Did a recording contain speech? Fed one RMS level (0..1) per sample frame
 * while recording, so a clip of silence or room hum is dropped in the browser
 * instead of being uploaded, transcribed (and billed), and coming back as
 * nothing — or as a hallucinated phrase, which Whisper does on silent audio.
 */

/** Never count a frame below this as a voice, whatever the room floor is. */
export const SPEECH_RMS_FLOOR = 0.0015
/** A voice must rise this far above the clip's own background level. */
export const SPEECH_OVER_NOISE = 2.5
/** Sustained level this high is a voice (or loud room) the meter can't separate: send it. */
export const LOUD_SUSTAINED_RMS = 0.02
/** How many loud frames make a recording worth sending (≈ a short word). */
export const MIN_SPEECH_FRAMES = 3

const percentile = (sorted: number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]

/**
 * Adaptive: "loud" is relative to the clip's own background (its 20th-percentile
 * level), so a quiet mic still registers speech and a noisy room doesn't count
 * as speech. A false veto drops what the user said, while a false pass only
 * costs one transcription (the server filters invented text), so when the
 * clip is loud throughout the meter lets it through.
 */
export function createSpeechMeter(minFrames = MIN_SPEECH_FRAMES) {
  const frames: number[] = []
  return {
    push(rms: number) {
      frames.push(rms)
    },
    heardSpeech(): boolean {
      if (frames.length === 0) return false
      const sorted = [...frames].sort((a, b) => a - b)
      const threshold = Math.max(SPEECH_RMS_FLOOR, percentile(sorted, 0.2) * SPEECH_OVER_NOISE)
      const loud = frames.filter((r) => r >= threshold).length
      if (loud >= minFrames) return true
      return frames.length >= minFrames && percentile(sorted, 0.9) >= LOUD_SUSTAINED_RMS
    },
  }
}

/**
 * Maps raw mic RMS to a 0..1 bar level that adapts to the setup: it tracks the
 * background floor (falls fast, rises slowly) and a decaying recent peak, so a
 * whisper on a quiet mic and normal speech on a hot one both fill the lane.
 */
export function createLevelNormalizer(minSpan = 0.006, peakDecay = 0.97, floorRise = 0.01) {
  let floor: number | null = null
  let peak = 0
  return (rms: number): number => {
    floor = floor === null || rms < floor ? rms : floor + (rms - floor) * floorRise
    const gate = floor * 1.3
    peak = Math.max(rms, peak * peakDecay, gate + minSpan)
    return Math.min(1, Math.max(0, (rms - gate) / (peak - gate)))
  }
}

/** Root-mean-square level of a time-domain buffer (samples in -1..1). */
export function rmsOf(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0
  let sum = 0
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
  return Math.sqrt(sum / samples.length)
}
