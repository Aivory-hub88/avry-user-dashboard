/**
 * Small-talk fast-path — greetings/thanks/bye/capability questions must be
 * answered deterministically (zero LLM round trips); anything containing a
 * real request must fall through to the normal path.
 *
 * Context: a plain "Halo selamat siang" was measured at ~40s end-to-end
 * because it paid a full bridge→OpenRouter reasoning-model round (with
 * observed timeout-retry chains). See matchSmallTalk() in
 * lib/workflows/copilotStateMachine.ts.
 */
import { describe, it, expect } from 'vitest'
import { matchSmallTalk } from './copilotStateMachine'

describe('matchSmallTalk — hits (deterministic reply, no LLM)', () => {
  const GREETINGS_ID = [
    'Halo selamat siang',
    'Selamat pagi!',
    'assalamualaikum',
    'Pagi min',
    'Hai kak',
  ]
  const GREETINGS_GENERIC = ['halo', 'hello aivory', 'hi', 'hello!', 'hey there', 'good morning']
  const THANKS = ['terima kasih', 'makasih banyak', 'thank you', 'thanks!']
  const BYES = ['bye', 'sampai jumpa', 'dadah dulu', 'goodbye']
  const CAPABILITY = ['bisa apa aja?', 'apa yang bisa kamu lakukan', 'what can you do?', 'who are you?']

  for (const m of GREETINGS_ID) {
    it(`greeting (ID): "${m}"`, () => {
      const reply = matchSmallTalk(m)
      expect(reply).toBeTruthy()
      expect(reply).toMatch(/Halo! Saya copilot/)
    })
  }
  for (const m of GREETINGS_GENERIC) {
    it(`greeting: "${m}"`, () => {
      expect(matchSmallTalk(m)).toBeTruthy()
    })
  }
  for (const m of THANKS) {
    it(`thanks: "${m}"`, () => {
      expect(matchSmallTalk(m)).toBeTruthy()
    })
  }
  for (const m of BYES) {
    it(`bye: "${m}"`, () => {
      expect(matchSmallTalk(m)).toBeTruthy()
    })
  }
  for (const m of CAPABILITY) {
    it(`capability: "${m}"`, () => {
      expect(matchSmallTalk(m)).toBeTruthy()
    })
  }
})

describe('matchSmallTalk — misses (real requests must reach the LLM path)', () => {
  const REAL_REQUESTS = [
    'Halo, buatkan workflow invoice otomatis',
    'halo, integrasikan slack ke notion',
    'Halo selamat siang, saya butuh otomasi onboarding klien',
    'kirim email ke customer baru setiap hari senin',
    'buat automation dari google form ke spreadsheet',
    'workflow untuk triase tiket masuk',
    'bisa gak connect ke hubspot?',           // capability phrasing + real target
    'apa itu workflow?',                       // question about a noun, not the copilot
    'terima kasih, sekarang ubah step pertama', // thanks + an edit request
    '',                                        // empty
  ]
  for (const m of REAL_REQUESTS) {
    it(`fall through: "${m}"`, () => {
      expect(matchSmallTalk(m)).toBeNull()
    })
  }
})
