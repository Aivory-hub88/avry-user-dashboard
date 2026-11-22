// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import ApprovalCard from './ApprovalCard'

afterEach(cleanup)

const base = { toolName: 'aivory-n8n__execute_workflow', riskTier: 'reversible', onApprove: vi.fn(), onDeny: vi.fn() }

describe('ApprovalCard', () => {
  it('names the action and offers Approve and Deny', () => {
    const onApprove = vi.fn()
    const onDeny = vi.fn()
    render(<ApprovalCard {...base} onApprove={onApprove} onDeny={onDeny} />)
    expect(screen.getByText(/Execute workflow/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    fireEvent.click(screen.getByRole('button', { name: 'Deny' }))
    expect(onApprove).toHaveBeenCalledTimes(1)
    expect(onDeny).toHaveBeenCalledTimes(1)
  })

  it('disables both buttons while a decision is in flight', () => {
    render(<ApprovalCard {...base} busy />)
    expect((screen.getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Deny' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('warns only for irreversible actions', () => {
    const { rerender } = render(<ApprovalCard {...base} />)
    expect(screen.queryByText(/can.t be undone/)).toBeNull()
    rerender(<ApprovalCard {...base} riskTier="irreversible" />)
    expect(screen.getByText(/can.t be undone/)).toBeTruthy()
  })

  it('shows an error and keeps the buttons so the user can retry', () => {
    render(<ApprovalCard {...base} error="Couldn't send your decision. Try again." />)
    expect(screen.getByRole('alert').textContent).toMatch(/Try again/)
    expect(screen.getByRole('button', { name: 'Approve' })).toBeTruthy()
  })

  it('collapses to a one-line result once decided', () => {
    render(<ApprovalCard {...base} outcome="approved" />)
    expect(screen.getByRole('status').textContent).toMatch(/Approved/)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
