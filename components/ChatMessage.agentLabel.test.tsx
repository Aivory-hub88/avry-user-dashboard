// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import ChatMessage from './ChatMessage'

// The label is the small grey line above the bubble; the name also appears in the avatar's alt text.
const label = (c: HTMLElement) => c.querySelector('div.mb-1')?.textContent ?? null

describe('ChatMessage agent label', () => {
  it('shows the agent name above the bubble when showAgentName is on', () => {
    const { container } = render(<ChatMessage role="assistant" content="Halo dari Lex" agentName="Lex" agentType="leads_qualifier" showAgentName />)
    expect(label(container)).toBe('Lex')
  })

  it('does not show it by default (direct chats)', () => {
    const { container } = render(<ChatMessage role="assistant" content="Halo" agentName="Lex" agentType="leads_qualifier" />)
    expect(label(container)).toBeNull()
  })
})
