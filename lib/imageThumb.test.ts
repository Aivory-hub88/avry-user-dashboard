import { describe, it, expect } from 'vitest'
import { thumbSize, THUMB_MAX_EDGE } from './imageThumb'
import { attachmentPreviewSrc } from '@/components/AttachmentCard'
import { stripHeavyAttachments, type PersistedSession } from './chatPersistence'

describe('thumbSize', () => {
  it('fits the longer edge and keeps aspect ratio', () => {
    expect(thumbSize(2946, 1604)).toEqual({ w: THUMB_MAX_EDGE, h: Math.round(1604 * THUMB_MAX_EDGE / 2946) })
    expect(thumbSize(1000, 4000)).toEqual({ w: 80, h: 320 })
  })
  it('never upscales small images', () => {
    expect(thumbSize(100, 50)).toEqual({ w: 100, h: 50 })
  })
  it('handles empty dimensions', () => {
    expect(thumbSize(0, 10)).toEqual({ w: 0, h: 0 })
  })
})

describe('attachmentPreviewSrc', () => {
  it('prefers the thumbnail, then in-memory image data, else nothing', () => {
    expect(attachmentPreviewSrc({ type: 'image', label: 'a', thumb: 'data:image/jpeg;base64,T', content: 'data:image/png;base64,FULL' })).toBe('data:image/jpeg;base64,T')
    expect(attachmentPreviewSrc({ type: 'file', label: 'a', content: 'data:image/png;base64,FULL' })).toBe('data:image/png;base64,FULL')
    expect(attachmentPreviewSrc({ type: 'file', label: 'n.txt', content: 'hello' })).toBeUndefined()
  })
})

describe('thumbnails survive persistence', () => {
  it('keeps thumb while dropping the full image', () => {
    const s: PersistedSession = {
      id: 's', title: 't', createdAt: 1, updatedAt: 1, agentType: null,
      messages: [{ id: 'm', role: 'user', content: 'x', attachments: [{ type: 'image', label: 'a.png', thumb: 'data:image/jpeg;base64,T', content: 'data:image/png;base64,' + 'A'.repeat(5000) }] } as any],
    }
    const a = (stripHeavyAttachments([s])[0].messages[0] as any).attachments[0]
    expect(a.thumb).toBe('data:image/jpeg;base64,T')
    expect(a.content).toBeUndefined()
  })
})
