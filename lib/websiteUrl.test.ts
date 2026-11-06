import { describe, it, expect } from 'vitest'
import { normalizeWebsiteInput } from './websiteUrl'

describe('normalizeWebsiteInput', () => {
  it('adds https:// to bare domains and drops the hash', () => {
    expect(normalizeWebsiteInput('toko.co.id')).toBe('https://toko.co.id/')
    expect(normalizeWebsiteInput(' http://a.com/x#top ')).toBe('http://a.com/x')
  })
  it('rejects empty, spaced, non-http, credentialed and dotless input', () => {
    for (const bad of ['', '   ', 'my shop.com', 'javascript:alert(1)', 'ftp://a.com', 'https://u:p@a.com', 'localhost', 'a'.repeat(301)]) {
      expect(normalizeWebsiteInput(bad)).toBeNull()
    }
  })
})
