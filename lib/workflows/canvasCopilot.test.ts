/**
 * Aivory Aether edits the workflow on the canvas — canvas -> steps, merge of
 * the edited result back onto the canvas, and the state machine routing an
 * open canvas into EDITING instead of generating a brand-new workflow.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const bridgeCalls: { op: string; body: any }[] = []
vi.mock('./bridgeCopilot', () => ({
  callCopilotOperation: vi.fn(async (op: string, body: any) => {
    bridgeCalls.push({ op, body: JSON.parse(JSON.stringify(body)) })
    if (op === 'edit') {
      const steps = [...body.current_workflow.steps, { id: 'new', type: 'action', title: 'Notify team on Slack', app: 'slack', testable: true }]
      return { workflow: { ...body.current_workflow, steps } }
    }
    if (op === 'clarify') return { message: 'It runs every day and backs up your Drive files.' }
    throw new Error(`unexpected op ${op}`)
  }),
}))

import { canvasToGeneratedWorkflow, mergeEditedNodes, normalizeStepTitle, countSteps } from './canvasCopilot'
import { CopilotStateMachine, isNewWorkflowRequest } from './copilotStateMachine'
import { convertToN8nWorkflow } from '@/lib/workflowConverter'
import { n8nToReactFlow } from '@/lib/n8nMapper'

const driveBackup = {
  name: 'Drive backup',
  nodes: [
    { id: 't', name: 'Schedule Trigger', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: [0, 0], parameters: { rule: { interval: [{ field: 'hours', hoursInterval: 6 }] } } },
    { id: 'a', name: 'Step 1: List Google Drive Files', type: 'n8n-nodes-base.googleDrive', typeVersion: 3, position: [200, 0], parameters: { resource: 'fileFolder', queryString: 'invoices' }, credentials: { googleDriveOAuth2Api: { id: '42', name: 'Irfan Drive' } } },
    { id: 'b', name: 'Step 2: Upload Backup to Backup Folder', type: 'n8n-nodes-base.googleDrive', typeVersion: 3, position: [400, 0], parameters: { folderId: { value: 'BACKUP' } } },
  ],
  connections: {
    'Schedule Trigger': { main: [[{ node: 'Step 1: List Google Drive Files', type: 'main', index: 0 }]] },
    'Step 1: List Google Drive Files': { main: [[{ node: 'Step 2: Upload Backup to Backup Folder', type: 'main', index: 0 }]] },
  },
} as any

describe('canvasToGeneratedWorkflow', () => {
  it('walks the canvas from its trigger into copilot steps', () => {
    const wf = canvasToGeneratedWorkflow(driveBackup)
    expect(wf.steps.map((s) => [s.type, s.title])).toEqual([
      ['trigger', 'Schedule Trigger'],
      ['action', 'List Google Drive Files'],
      ['action', 'Upload Backup to Backup Folder'],
    ])
    expect(wf.steps[1].app).toBe('google drive')
  })

  it('turns an If node into a condition with both branches and continues after the join', () => {
    const wf = canvasToGeneratedWorkflow({
      name: 'x',
      nodes: [
        { id: '1', name: 'Webhook', type: 'n8n-nodes-base.webhook', typeVersion: 1, position: [0, 0], parameters: {} },
        { id: '2', name: 'Is VIP?', type: 'n8n-nodes-base.if', typeVersion: 2, position: [0, 0], parameters: {} },
        { id: '3', name: 'Email VIP', type: 'n8n-nodes-base.gmail', typeVersion: 2, position: [0, 0], parameters: {} },
        { id: '4', name: 'Email normal', type: 'n8n-nodes-base.gmail', typeVersion: 2, position: [0, 0], parameters: {} },
        { id: '5', name: 'Log', type: 'n8n-nodes-base.set', typeVersion: 3, position: [0, 0], parameters: {} },
      ],
      connections: {
        Webhook: { main: [[{ node: 'Is VIP?', type: 'main', index: 0 }]] },
        'Is VIP?': { main: [[{ node: 'Email VIP', type: 'main', index: 0 }], [{ node: 'Email normal', type: 'main', index: 0 }]] },
        'Email VIP': { main: [[{ node: 'Log', type: 'main', index: 0 }]] },
        'Email normal': { main: [[{ node: 'Log', type: 'main', index: 0 }]] },
      },
    } as any)
    expect(wf.steps.map((s) => s.title)).toEqual(['Webhook', 'Is VIP?', 'Log'])
    expect(wf.steps[1].type).toBe('condition')
    expect(wf.steps[1].branches?.map((b) => b.steps.map((s) => s.title))).toEqual([['Email VIP'], ['Email normal']])
    expect(countSteps(wf.steps)).toBe(5)
  })

  it('folds AI sub-nodes into their agent and keeps unreachable nodes', () => {
    const wf = canvasToGeneratedWorkflow({
      name: 'x',
      nodes: [
        { id: '1', name: 'Webhook', type: 'n8n-nodes-base.webhook', typeVersion: 1, position: [0, 0], parameters: {} },
        { id: '2', name: 'Agent', type: '@n8n/n8n-nodes-langchain.agent', typeVersion: 1.7, position: [0, 0], parameters: {} },
        { id: '3', name: 'OpenAI Chat Model', type: '@n8n/n8n-nodes-langchain.lmChatOpenAi', typeVersion: 1, position: [0, 0], parameters: {} },
        { id: '4', name: 'Orphan', type: 'n8n-nodes-base.set', typeVersion: 3, position: [0, 0], parameters: {} },
      ],
      connections: {
        Webhook: { main: [[{ node: 'Agent', type: 'main', index: 0 }]] },
        'OpenAI Chat Model': { ai_languageModel: [[{ node: 'Agent', type: 'ai_languageModel', index: 0 }]] },
      },
    } as any)
    expect(wf.steps.map((s) => s.title)).toEqual(['Webhook', 'Agent', 'Orphan'])
  })
})

describe('mergeEditedNodes', () => {
  const toRf = (wf: any) => n8nToReactFlow(wf)

  it('keeps unchanged steps (params + credentials), adds the new one, keeps the trigger', () => {
    const original = toRf(driveBackup)
    const edited = canvasToGeneratedWorkflow(driveBackup)
    edited.steps.push({ id: 'n', type: 'action', title: 'Notify team on Slack', app: 'slack', testable: true })
    const rebuilt = toRf(
      convertToN8nWorkflow({
        workflow_id: 'x',
        title: 'Drive backup',
        trigger: edited.steps[0].title,
        steps: edited.steps.slice(1).map((s) => ({ step: 0, action: s.title, tool: s.app || '', output: '' })),
        keepLastStepIntent: true,
      }),
    )
    const merged = mergeEditedNodes(original, rebuilt, { keepTrigger: true })
    expect(merged.kept).toBe(3)
    expect(merged.added).toBe(1)
    expect(merged.removed).toBe(0)

    const list = merged.nodes.find((n) => normalizeStepTitle(n.data.title) === 'list google drive files')!
    expect(list.data.rawN8n.parameters.queryString).toBe('invoices')
    expect(list.data.rawN8n.credentials.googleDriveOAuth2Api.id).toBe('42')
    const trigger = merged.nodes.find((n) => n.data.rawN8n?.type === 'n8n-nodes-base.scheduleTrigger')!
    expect(trigger.data.rawN8n.parameters.rule.interval[0].hoursInterval).toBe(6)
    expect(merged.nodes.some((n) => n.data.rawN8n?.type === 'n8n-nodes-base.slack')).toBe(true)
    // Every edge points at a node that exists.
    const ids = new Set(merged.nodes.map((n) => n.id))
    expect(merged.edges.every((e) => ids.has(e.source) && ids.has(e.target))).toBe(true)
  })

  it('drops removed steps', () => {
    const original = toRf(driveBackup)
    const rebuilt = toRf(
      convertToN8nWorkflow({
        workflow_id: 'x',
        title: 'Drive backup',
        trigger: 'Schedule Trigger',
        steps: [{ step: 0, action: 'List Google Drive Files', tool: 'google drive', output: '' }],
        keepLastStepIntent: true,
      }),
    )
    const merged = mergeEditedNodes(original, rebuilt, { keepTrigger: true })
    expect(merged.removed).toBe(1)
    expect(merged.nodes.some((n) => /upload backup/i.test(n.data.title))).toBe(false)
  })
})

describe('isNewWorkflowRequest', () => {
  it.each([
    'buatin workflow yang kirim email tiap pagi',
    'create a workflow that syncs HubSpot to Sheets',
    'I want a new workflow for invoices',
    'bikin otomasi baru',
  ])('new: %s', (m) => expect(isNewWorkflowRequest(m)).toBe(true))

  it.each([
    'tambah step kirim slack setelah upload',
    'hapus step download',
    'ganti trigger jadi tiap jam',
    'add an approval before uploading',
  ])('edit: %s', (m) => expect(isNewWorkflowRequest(m)).toBe(false))
})

describe('CopilotStateMachine — canvas edit mode', () => {
  const canvas = () => ({ workflowId: 'wf-1', title: 'Drive backup', workflow: canvasToGeneratedWorkflow(driveBackup) })
  beforeEach(() => { bridgeCalls.length = 0 })

  it('edits the open canvas instead of generating a new workflow', async () => {
    const m = new CopilotStateMachine('s1')
    const st = await m.processMessage('tambah step kirim notifikasi Slack di akhir', canvas())
    expect(bridgeCalls.map((c) => c.op)).toEqual(['edit'])
    expect(bridgeCalls[0].body.current_workflow.steps).toHaveLength(3)
    expect(st.stage).toBe('AWAITING_CONFIRMATION')
    expect(st.canvasTarget).toEqual({ workflowId: 'wf-1', title: 'Drive backup' })
    expect(st.generatedWorkflow?.steps.at(-1)?.title).toBe('Notify team on Slack')
    expect(st.lastMessage).toContain('Drive backup')
  })

  it('continues editing after the workflow was applied (COMPLETED), re-reading the canvas', async () => {
    const m = new CopilotStateMachine('s1', {
      ...(await new CopilotStateMachine('s0').processMessage('hai')),
      stage: 'COMPLETED',
    })
    const st = await m.processMessage('hapus step upload', canvas())
    expect(bridgeCalls.map((c) => c.op)).toEqual(['edit'])
    expect(st.stage).toBe('AWAITING_CONFIRMATION')
  })

  it('answers questions about the open workflow with its steps as context', async () => {
    const m = new CopilotStateMachine('s1')
    const st = await m.processMessage('workflow ini jalan kapan aja?', canvas())
    expect(bridgeCalls[0].op).toBe('clarify')
    expect(bridgeCalls[0].body.user_request).toContain('List Google Drive Files')
    expect(st.stage).toBe('IDLE')
  })

  it('still starts a new workflow when the user asks for one', async () => {
    const m = new CopilotStateMachine('s1')
    const st = await m.processMessage('hai', canvas())
    expect(bridgeCalls).toHaveLength(0)
    expect(st.canvasTarget ?? null).toBeNull()
    expect(isNewWorkflowRequest('buatin workflow baru buat invoice')).toBe(true)
  })
})
