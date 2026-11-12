// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { STORAGE_OWNER_GUARD_JS, STORAGE_OWNER_KEY } from './storageOwnerGuard'

const run = () => new Function(STORAGE_OWNER_GUARD_JS)()
const signIn = (id: string) =>
  localStorage.setItem('aivory_auth', JSON.stringify({ access_token: 't', user: { id } }))

function seedForeignCaches() {
  localStorage.setItem('aivory_diagnostic_context', '{"report":"A"}')
  localStorage.setItem('aivory_deep_diagnostic', '{"progress":1}')
  localStorage.setItem('aivory_n8n_credentials', '{"apiKey":"secret"}')
  localStorage.setItem('aivory:routing:ctx', '{}')
  localStorage.setItem('user_id', 'user_A')
  localStorage.setItem('user_data', '{"user_id":"user_A"}')
  localStorage.setItem('auth_token', 'old')
  localStorage.setItem('settings_notes', 'x')
  localStorage.setItem('aivory_chat_sessions__u_user_A', '[1]')
  localStorage.setItem('aivory_locale', 'id')
  localStorage.setItem('third_party_thing', 'keep')
}

class MemoryStorage {
  private m = new Map<string, string>()
  get length() { return this.m.size }
  key(i: number) { return [...this.m.keys()][i] ?? null }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null }
  setItem(k: string, v: string) { this.m.set(k, String(v)) }
  removeItem(k: string) { this.m.delete(k) }
  clear() { this.m.clear() }
}

let localStorage: MemoryStorage
beforeEach(() => {
  localStorage = new MemoryStorage()
  Object.defineProperty(window, 'localStorage', { value: localStorage, configurable: true })
})

describe('storage owner guard', () => {
  it('wipes the previous account caches when a different user signs in', () => {
    seedForeignCaches()
    localStorage.setItem(STORAGE_OWNER_KEY, 'user_A')
    signIn('user_B')
    run()
    for (const k of [
      'aivory_diagnostic_context',
      'aivory_deep_diagnostic',
      'aivory_n8n_credentials',
      'aivory:routing:ctx',
      'user_id',
      'user_data',
      'auth_token',
      'settings_notes',
    ]) {
      expect(localStorage.getItem(k), k).toBeNull()
    }
    expect(localStorage.getItem(STORAGE_OWNER_KEY)).toBe('user_B')
    // Per-user namespaced data, the session itself, preferences and other apps stay.
    expect(localStorage.getItem('aivory_chat_sessions__u_user_A')).toBe('[1]')
    expect(localStorage.getItem('aivory_auth')).not.toBeNull()
    expect(localStorage.getItem('aivory_locale')).toBe('id')
    expect(localStorage.getItem('third_party_thing')).toBe('keep')
  })

  it('treats caches with no recorded owner as foreign (first run after deploy)', () => {
    seedForeignCaches()
    signIn('user_B')
    run()
    expect(localStorage.getItem('aivory_n8n_credentials')).toBeNull()
    expect(localStorage.getItem(STORAGE_OWNER_KEY)).toBe('user_B')
  })

  it('keeps the caches of the same user across reloads', () => {
    signIn('user_B')
    run()
    localStorage.setItem('aivory_diagnostic_context', '{"report":"B"}')
    run()
    expect(localStorage.getItem('aivory_diagnostic_context')).toBe('{"report":"B"}')
  })

  it('does nothing while signed out', () => {
    seedForeignCaches()
    run()
    expect(localStorage.getItem('aivory_diagnostic_context')).not.toBeNull()
    expect(localStorage.getItem(STORAGE_OWNER_KEY)).toBeNull()
  })
})
