/**
 * Did a recording contain speech? Fed one RMS level (0..1) per sample frame
 * while recording, so a clip of silence or room hum is dropped in the browser
 * instead of being uploaded, transcribed (and billed), and coming back as
 * nothing — or as a hallucinated phrase, which Whisper does on silent audio.
 */

/** Below this a frame is background noise, not a voice. */
export const SPEECH_RMS_THRESHOLD = 0.005
/** How many loud frames make a recording worth sending (≈ a short word). */
export const MIN_SPEECH_FRAMES = 3

export function createSpeechMeter(threshold = SPEECH_RMS_THRESHOLD, minFrames = MIN_SPEECH_FRAMES) {
  let loud = 0
  return {
    push(rms: number) {
      if (rms >= threshold) loud += 1
    },
    heardSpeech: () => loud >= minFrames,
  }
}

/** Root-mean-square level of a time-domain buffer (samples in -1..1). */
export function rmsOf(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0
  let sum = 0
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
  return Math.sqrt(sum / samples.length)
}
