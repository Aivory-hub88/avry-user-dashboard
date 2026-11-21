import { describe, it, expect } from 'vitest'
import { stripHeavyAttachments, type PersistedSession } from './chatPersistence'

const big = 'data:image/png;base64,' + 'A'.repeat(2_000_000)
const session = (attachments: any[]): PersistedSession => ({
  id: 's1', title: 't', createdAt: 1, updatedAt: 1, agentType: null,
  messages: [{ id: 'm1', role: 'user', content: 'hi', attachments } as any],
})

describe('stripHeavyAttachments', () => {
  it('drops image data URLs but keeps name and type', () => {
    const [s] = stripHeavyAttachments([session([{ type: 'image', label: 'a.png', filename: 'a.png', content: big }])])
    const a = (s.messages[0] as any).attachments[0]
    expect(a).toMatchObject({ type: 'image', label: 'a.png', filename: 'a.png' })
    expect(a.content).toBeUndefined()
    expect(JSON.stringify(s).length).toBeLessThan(1000)
  })

  it('keeps document text attachments untouched', () => {
    const input = session([{ type: 'file', label: 'n.txt', filename: 'n.txt', content: 'hello' }])
    expect(stripHeavyAttachments([input])[0]).toBe(input)
  })

  it('does not mutate the in-memory sessions', () => {
    const input = session([{ type: 'image', label: 'a.png', content: big }])
    stripHeavyAttachments([input])
    expect((input.messages[0] as any).attachments[0].content).toBe(big)
  })
})
