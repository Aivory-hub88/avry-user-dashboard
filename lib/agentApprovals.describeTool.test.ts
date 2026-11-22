import { describe, it, expect } from 'vitest'
import { describeTool } from './agentApprovals'

describe('describeTool', () => {
  it('reads the n8n servers without the tenant_/aivory- plumbing', () => {
    expect(describeTool('tenant_aivory-n8n__execute_workflow')).toBe('n8n — Execute workflow')
    expect(describeTool('tenant_aivory-n8n-read__search_workflows')).toBe('n8n — Search workflows')
  })

  it('keeps other tenant servers readable', () => {
    expect(describeTool('tenant_odoo__odoo_search_read')).toBe('Odoo — Odoo search read')
  })

  it('leaves Composio and bare tool names as they were', () => {
    expect(describeTool('composio-googledrive-share__GOOGLEDRIVE_CREATE_PERMISSION')).toBe('Googledrive — Create permission')
    expect(describeTool('shell')).toBe('Shell')
  })
})
