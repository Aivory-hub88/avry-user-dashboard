// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import messages from '@/messages/en.json'

const api = vi.hoisted(() => ({
  getN8nMcpConnection: vi.fn(),
  connectN8nMcp: vi.fn(),
  reverifyN8nMcp: vi.fn(),
  replaceN8nMcpToken: vi.fn(),
  updateN8nMcpTools: vi.fn(),
  updateN8nMcpAgents: vi.fn(),
  disconnectN8nMcp: vi.fn(),
}))
const access = vi.hoisted(() => ({ value: 'allowed' as string }))

vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }))
vi.mock('@/hooks/useN8nMcpAccess', () => ({ useN8nMcpAccess: () => access.value }))
vi.mock('@/lib/n8nMcpConnection', async (orig) => ({ ...(await orig<typeof import('@/lib/n8nMcpConnection')>()), ...api }))

import { N8nMcpConnectPanel } from './N8nMcpConnectPanel'
import { N8nMcpConnectionError } from '@/lib/n8nMcpConnection'

const PHASE1 = ['search_workflows', 'get_workflow_details', 'execute_workflow', 'get_execution', 'search_executions']

function conn(over: Record<string, unknown> = {}) {
  return {
    url: 'https://n8n.example.com/mcp-server/http',
    status: 'verified',
    risk_tier: 'reversible',
    last_verified_at: '2026-11-22T10:00:00Z',
    last_verify_error: null,
    tool_count: 28,
    tools: [
      ...PHASE1.map((name) => ({ name, description: `${name} desc`, available: true, enabled: true })),
      { name: 'list_credentials', description: 'lists creds', available: false, enabled: false },
      { name: 'publish_workflow', description: 'publishes', available: false, enabled: false },
    ],
    enabled_tools: PHASE1,
    agent_types: [],
    created_at: '2026-11-22T09:00:00Z',
    updated_at: '2026-11-22T10:00:00Z',
    ...over,
  }
}

function renderPanel() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <N8nMcpConnectPanel />
    </NextIntlClientProvider>,
  )
}

async function openAndFill(url = 'https://n8n.example.com/mcp-server/http', token = 'tok') {
  fireEvent.click(await screen.findByRole('button', { name: 'Set up' }))
  fireEvent.change(screen.getByLabelText('n8n MCP URL'), { target: { value: url } })
  fireEvent.change(screen.getByLabelText('MCP access token'), { target: { value: token } })
  fireEvent.click(screen.getByRole('button', { name: 'Connect and verify' }))
}

beforeEach(() => {
  access.value = 'allowed'
  Object.values(api).forEach((m) => m.mockReset())
  api.getN8nMcpConnection.mockResolvedValue({ connection: null, phase1_tools: PHASE1 })
})
afterEach(cleanup)

describe('N8nMcpConnectPanel', () => {
  it('shows a top-up call to action, not a disabled form, for accounts without credits', async () => {
    access.value = 'no_credit'
    renderPanel()
    const cta = await screen.findByRole('link', { name: /top up or upgrade/i })
    expect(cta.getAttribute('href')).toBe('/dashboard/subscriptions')
    expect(screen.queryByLabelText(/MCP access token/i)).toBeNull()
  })

  it('renders nothing while the credit check is loading', async () => {
    access.value = 'loading'
    const { container } = renderPanel()
    await waitFor(() => expect(api.getN8nMcpConnection).toHaveBeenCalled())
    expect(container.textContent).toBe('')
  })

  it('connects, sends the token in the body, and drops the token from the DOM after submit', async () => {
    api.connectN8nMcp.mockResolvedValue(conn())
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: 'Set up' }))
    const tokenInput = screen.getByLabelText('MCP access token') as HTMLInputElement
    expect(tokenInput.type).toBe('password')
    fireEvent.change(screen.getByLabelText('n8n MCP URL'), { target: { value: 'https://n8n.example.com/mcp-server/http' } })
    fireEvent.change(tokenInput, { target: { value: 'Bearer s3cret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Connect and verify' }))
    await screen.findByText('Connected')
    expect(api.connectN8nMcp).toHaveBeenCalledWith({ url: 'https://n8n.example.com/mcp-server/http', token: 'Bearer s3cret' })
    expect(document.body.innerHTML).not.toContain('s3cret')
    expect(screen.queryByLabelText('MCP access token')).toBeNull()
  })

  it('shows the phase 1 tools as toggles and every other tool as locked, not togglable', async () => {
    api.getN8nMcpConnection.mockResolvedValue({ connection: conn(), phase1_tools: PHASE1 })
    renderPanel()
    await screen.findByText('Connected')
    PHASE1.forEach((name) => expect((screen.getByLabelText(new RegExp(name)) as HTMLInputElement).checked).toBe(true))
    expect(screen.getByText(/5 of 5 on/)).toBeTruthy()
    expect(screen.queryByRole('checkbox', { name: /list_credentials/ })).toBeNull()
    expect(screen.queryByRole('checkbox', { name: /publish_workflow/ })).toBeNull()
    const locked = Array.from(document.querySelectorAll('[data-locked="true"]')).map((l) => l.textContent ?? '')
    expect(locked).toHaveLength(2)
    expect(locked[0]).toContain('list_credentials')
    expect(locked[1]).toContain('publish_workflow')
    expect(screen.getByText(/28 tools found/)).toBeTruthy()
  })

  it('toggling a tool sends the full enabled set', async () => {
    api.getN8nMcpConnection.mockResolvedValue({ connection: conn(), phase1_tools: PHASE1 })
    api.updateN8nMcpTools.mockResolvedValue(conn({ enabled_tools: PHASE1.filter((n) => n !== 'execute_workflow') }))
    renderPanel()
    await screen.findByText('Connected')
    fireEvent.click(screen.getByLabelText(/execute_workflow/))
    await waitFor(() =>
      expect(api.updateN8nMcpTools).toHaveBeenCalledWith(PHASE1.filter((n) => n !== 'execute_workflow')),
    )
  })

  it('on a 422 the saved connection is shown inline with the reason and a re-verify path', async () => {
    api.connectN8nMcp.mockRejectedValue(
      new N8nMcpConnectionError(
        'Unauthorized (401)',
        422,
        conn({ status: 'verification_failed', last_verify_error: 'Unauthorized (401)', tools: [], tool_count: null, enabled_tools: [] }) as never,
      ),
    )
    renderPanel()
    await openAndFill()
    await screen.findByText('Verification failed', { selector: '[role=status]' })
    expect(screen.getAllByText(/Unauthorized \(401\)/).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Verify again' })).toBeTruthy()
    expect(screen.getByText(/REST API key instead of an MCP token/)).toBeTruthy()
  })

  it.each([
    [400, /must start with https/],
    [402, /credits have run out/],
    [403, /Aivory's own n8n instances/],
    [429, /Too many verification attempts/],
  ])('maps %i on connect to a clear message and keeps the form', async (status, pattern) => {
    api.connectN8nMcp.mockRejectedValue(new N8nMcpConnectionError('x', status))
    renderPanel()
    await openAndFill('http://n8n.example.com')
    expect((await screen.findByRole('alert')).textContent).toMatch(pattern)
    expect(screen.getByLabelText('n8n MCP URL')).toBeTruthy()
  })

  it('explains a 403 on the agent picker as "not running on Cerveau"', async () => {
    api.getN8nMcpConnection.mockResolvedValue({ connection: conn(), phase1_tools: PHASE1 })
    api.updateN8nMcpAgents.mockRejectedValue(new N8nMcpConnectionError('x', 403))
    renderPanel()
    await screen.findByText('Connected')
    const firstAgent = document.querySelector('[id^="n8n-mcp-agent-"]') as HTMLInputElement
    fireEvent.click(firstAgent)
    fireEvent.click(screen.getByRole('button', { name: 'Save agents' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/not running on Cerveau/)
    expect(api.updateN8nMcpAgents).toHaveBeenCalledWith([firstAgent.id.replace('n8n-mcp-agent-', '')])
  })

  it('keeps an existing connection manageable when credits are gone, with a warning', async () => {
    access.value = 'no_credit'
    api.getN8nMcpConnection.mockResolvedValue({ connection: conn(), phase1_tools: PHASE1 })
    renderPanel()
    await screen.findByText('Connected')
    expect(screen.getByText(/credits have run out/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeTruthy()
  })

  it('disconnect asks for confirmation, then clears the connection', async () => {
    api.getN8nMcpConnection.mockResolvedValue({ connection: conn(), phase1_tools: PHASE1 })
    api.disconnectN8nMcp.mockResolvedValue(undefined)
    renderPanel()
    await screen.findByText('Connected')
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
    expect(api.disconnectN8nMcp).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Yes, disconnect' }))
    await waitFor(() => expect(api.disconnectN8nMcp).toHaveBeenCalled())
    await screen.findByRole('button', { name: 'Set up' })
  })

  it('help text says the MCP token is not the REST API key', async () => {
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: 'Set up' }))
    expect(screen.getByText(/NOT the n8n API key/)).toBeTruthy()
    expect(screen.getByText(/Instance-level MCP/)).toBeTruthy()
    expect(screen.getByText(/Available in MCP/, { exact: false })).toBeTruthy()
    expect(screen.getByText(/dedicated n8n account/)).toBeTruthy()
  })
})
