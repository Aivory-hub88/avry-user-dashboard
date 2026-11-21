// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import CopySecretRow from './CopySecretRow'

const props = { value: 'avry_secret_123', copyLabel: 'Copy', copiedLabel: 'Copied', failedLabel: 'Copy failed' }

function mockClipboard(writeText: () => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
}

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('CopySecretRow', () => {
  it('shows Copied only after the clipboard write succeeds', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    mockClipboard(writeText)
    render(<CopySecretRow {...props} />)
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(screen.getByRole('button').textContent).toBe('Copied'))
    expect(writeText).toHaveBeenCalledWith('avry_secret_123')
  })

  it('does not show the copied state when writeText rejects and the fallback fails', async () => {
    mockClipboard(() => Promise.reject(new Error('denied')))
    ;(document as unknown as { execCommand: () => boolean }).execCommand = vi.fn(() => false)
    render(<CopySecretRow {...props} />)
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Copy failed'))
    expect(screen.getByRole('button').textContent).toBe('Copy')
    expect(screen.queryByText('Copied')).toBeNull()
  })

  it('falls back to execCommand when writeText rejects', async () => {
    mockClipboard(() => Promise.reject(new Error('denied')))
    const exec = vi.fn(() => true)
    ;(document as unknown as { execCommand: () => boolean }).execCommand = exec
    render(<CopySecretRow {...props} />)
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(screen.getByRole('button').textContent).toBe('Copied'))
    expect(exec).toHaveBeenCalledWith('copy')
  })
})
