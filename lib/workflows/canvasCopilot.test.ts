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
    if (op === 'edit' && /ubah total/i.test(body.edit_request)) {
      // A full rewrite: every step is new (the trigger keeps its id).
      const [trigger] = body.current_workflow.steps
      const steps = [
        trigger,
        { id: 'x1', type: 'action', title: 'Read invoice emails', app: 'gmail', testable: true },
        { id: 'x2', type: 'action', title: 'Add row to Google Sheets', app: 'googleSheets', testable: true },
      ]
      return { workflow: { ...body.current_workflow, steps } }
    }
    if (op === 'edit') {
      const steps = [...body.current_workflow.steps, { id: 'new', type: 'action', title: 'Notify team on Slack', app: 'slack', testable: true }]
      return { workflow: { ...body.current_workflow, steps } }
    }
    if (op === 'clarify') return { message: 'It runs every day and backs up your Drive files.' }
    throw new Error(`unexpected op ${op}`)
  }),
}))

import { canvasToGeneratedWorkflow, mergeEditedNodes, normalizeStepTitle, countSteps, stepIdAliases, diffSteps } from './canvasCopilot'
import { CopilotStateMachine, isNewWorkflowRequest, matchEditCapabilityQuestion, buildUserContext, isNearTotalRewrite, matchRewriteChoice } from './copilotStateMachine'
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

describe('buildUserContext', () => {
  const m = (role: 'user' | 'assistant', content: string) => ({ role, content }) as Parameters<typeof buildUserContext>[0][number]
  it('keeps the user\'s own requests, newest last, and drops confirmations and assistant turns', () => {
    const out = buildUserContext([
      m('user', 'buat workflow: lead masuk lewat webhook, email ke sales'),
      m('assistant', 'Here are the changes ...'),
      m('user', 'yes'),
      m('user', 'tambah step kirim notifikasi ke Slack #sales-leads'),
    ])
    expect(out).toBe('- buat workflow: lead masuk lewat webhook, email ke sales\n- tambah step kirim notifikasi ke Slack #sales-leads')
  })
  it('is empty for no usable history and respects the size cap', () => {
    expect(buildUserContext([])).toBe('')
    const long = 'x'.repeat(590)
    expect(buildUserContext([m('user', long), m('user', long), m('user', long)], 1500).split('\n').length).toBe(2)
  })
})

describe('matchEditCapabilityQuestion', () => {
  const steps = [
    { id: 'a', type: 'trigger', title: 'Schedule Trigger', testable: false },
    { id: 'b', type: 'action', title: 'List Google Drive Files', testable: true },
    { id: 'c', type: 'action', title: 'Download Files to Temporary Storage', testable: true },
    { id: 'd', type: 'action', title: 'Upload Backup to Backup Folder', testable: true },
  ] as Parameters<typeof matchEditCapabilityQuestion>[1]

  it('asks what to change instead of editing blindly', () => {
    const r = matchEditCapabilityQuestion('Bisa lo rubah gak step 4?', steps)
    expect(r).toContain('Step 4')
    expect(r).toContain('Upload Backup to Backup Folder')
    expect(matchEditCapabilityQuestion('can you change step 2?', steps)).toContain('List Google Drive Files')
  })

  it.each([
    'step 4 bisa dirubah?',
    'step 4 bisa diganti gak?',
    'step 4 boleh diubah?',
    'apakah step 4 bisa diedit?',
    'step 4 bisa diubah ga',
  ])('handles Indonesian affixes: %s', (m) => expect(matchEditCapabilityQuestion(m, steps)).toContain('Step 4'))

  it.each([
    'bisa tambah step approval?',
    'ubah step 4 jadi kirim ke Slack',
    'can you change step 2 to use Dropbox?',
    'hapus step download',
    'step 4 bisa diganti jadi slack?',
  ])('leaves real edit requests alone: %s', (m) => expect(matchEditCapabilityQuestion(m, steps)).toBeNull())
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

describe('mergeEditedNodes — identity survives retitling', () => {
  it('keeps the original node when the edit engine renamed an untouched step', () => {
    const original = n8nToReactFlow(driveBackup)
    const edited = canvasToGeneratedWorkflow(driveBackup)
    // The engine rewrites the title but keeps the id.
    edited.steps[1] = { ...edited.steps[1], title: 'List invoice files in Google Drive' }
    const rebuilt = n8nToReactFlow(
      convertToN8nWorkflow({
        workflow_id: 'x',
        title: 'Drive backup',
        trigger: edited.steps[0].title,
        steps: edited.steps.slice(1).map((s) => ({ step: 0, action: s.title, tool: s.app || '', output: '' })),
        keepLastStepIntent: true,
      }) as any,
    )
    const merged = mergeEditedNodes(original, rebuilt, {
      keepTrigger: true,
      idAliases: stepIdAliases(edited.steps, original.nodes),
    })
    expect(merged.kept).toBe(3)
    const list = merged.nodes.find((n) => /list invoice files/i.test(n.data.title))!
    expect(list.data.rawN8n.credentials.googleDriveOAuth2Api.id).toBe('42')
  })
})

describe('CopilotStateMachine — leftover proposal vs open canvas', () => {
  const canvas = () => ({ workflowId: 'wf-1', title: 'Drive backup', workflow: canvasToGeneratedWorkflow(driveBackup) })
  const pending = (minutesAgo: number) => ({
    sessionId: 's', stage: 'AWAITING_APPLY_APPROVAL' as const, userRequest: 'slack', conversationHistory: [],
    generatedWorkflow: { workflowName: 'Webhook to Slack', steps: [{ id: 'x', type: 'trigger' as const, title: 'Webhook', testable: false }], estimate_hours: 0, automation_score: 0, summary: '', nodeConfigs: [] },
    testResults: null, testAttempts: 0, userApprovals: { confirmedWorkflow: true, approvedTest: true, appliedToCanvas: false },
    lastMessage: '', createdAt: new Date().toISOString(), updatedAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  })
  beforeEach(() => { bridgeCalls.length = 0 })

  it('a fresh unapplied proposal keeps the conversation', async () => {
    const st = await new CopilotStateMachine('s', pending(2)).processMessage('tambah step email', canvas())
    expect(st.canvasTarget ?? null).toBeNull()
    expect(bridgeCalls[0]?.body.current_workflow.workflowName).toBe('Webhook to Slack')
  })

  it('an old unapplied proposal yields to the open canvas', async () => {
    const st = await new CopilotStateMachine('s', pending(45)).processMessage('tambah step email', canvas())
    expect(st.canvasTarget?.workflowId).toBe('wf-1')
  })

  it('pointing at the open workflow wins even when the proposal is fresh', async () => {
    const st = await new CopilotStateMachine('s', pending(2)).processMessage('tambah step email di workflow ini', canvas())
    expect(st.canvasTarget?.workflowId).toBe('wf-1')
  })
})

describe('diffSteps', () => {
  const base = canvasToGeneratedWorkflow(driveBackup).steps

  it('reports added, kept and removed steps', () => {
    const edited = [...base.slice(0, 2), { id: 'n', type: 'action' as const, title: 'Notify team on Slack', testable: true }]
    const d = diffSteps(base, edited)
    expect([d.added, d.removed, d.kept]).toEqual([1, 1, 2])
    expect(d.changes.find((c) => c.kind === 'removed')?.title).toBe('Upload Backup to Backup Folder')
    expect(d.changes.find((c) => c.kind === 'added')?.title).toBe('Notify team on Slack')
  })

  it('treats a retitled step with the same id as renamed, not added+removed', () => {
    const edited = base.map((s, i) => (i === 1 ? { ...s, title: 'List invoice files' } : s))
    const d = diffSteps(base, edited)
    expect([d.added, d.removed, d.renamed, d.kept]).toEqual([0, 0, 1, 2])
    expect(d.changes[1]).toMatchObject({ kind: 'renamed', from: 'List Google Drive Files', title: 'List invoice files' })
  })

  it('is empty-change when nothing differs', () => {
    const d = diffSteps(base, base)
    expect([d.added, d.removed, d.renamed]).toEqual([0, 0, 0])
  })
})

describe('mergeEditedNodes — layout', () => {
  const rebuild = (extra: boolean) => {
    const steps: any[] = [
      { step: 0, action: 'List Google Drive Files', tool: 'google drive', output: '' },
      { step: 0, action: 'Upload Backup to Backup Folder', tool: 'google drive', output: '' },
      ...(extra ? [{ step: 0, action: 'Notify team on Slack', tool: 'slack', output: '' }] : []),
    ]
    return n8nToReactFlow(convertToN8nWorkflow({ workflow_id: 'x', title: 'Drive backup', trigger: 'Schedule Trigger', steps, keepLastStepIntent: true }) as any)
  }

  it('keeps the user\'s own positions when the edit adds or removes nothing', () => {
    const original = n8nToReactFlow(driveBackup)
    original.nodes[1].position = { x: 777, y: 333 } // the user dragged this node
    const merged = mergeEditedNodes(original, rebuild(false), { keepTrigger: true })
    expect(merged.added).toBe(0)
    expect(merged.removed).toBe(0)
    const moved = merged.nodes.find((n) => normalizeStepTitle(n.data.title) === 'list google drive files')!
    expect(moved.position).toEqual({ x: 777, y: 333 })
  })

  it('keeps existing nodes in place when a step is added at the end, and puts the new one after its parent', () => {
    const original = n8nToReactFlow(driveBackup)
    original.nodes[1].position = { x: 777, y: 333 }
    const merged = mergeEditedNodes(original, rebuild(true), { keepTrigger: true })
    expect(merged.added).toBe(1)
    const moved = merged.nodes.find((n) => normalizeStepTitle(n.data.title) === 'list google drive files')!
    expect(moved.position).toEqual({ x: 777, y: 333 })
    const upload = merged.nodes.find((n) => normalizeStepTitle(n.data.title) === 'upload backup to backup folder')!
    const slack = merged.nodes.find((n) => n.data.rawN8n?.type === 'n8n-nodes-base.slack')!
    expect(slack.position.x).toBeGreaterThan(upload.position.x)
    expect(slack.position.y).toBe(upload.position.y)
  })

  it('never stacks two nodes on the same spot after an edit', () => {
    const original = n8nToReactFlow(driveBackup)
    const merged = mergeEditedNodes(original, rebuild(true), { keepTrigger: true })
    const spots = merged.nodes.map((n) => `${Math.round(n.position.x)},${Math.round(n.position.y)}`)
    expect(new Set(spots).size).toBe(spots.length)
  })
})

describe('canvas round trip does not add Merge nodes', () => {
  const plan: any[] = [
    { step: 1, action: 'Read leads', tool: 'googlesheets action', app: 'googlesheets', appAction: 'read', output: '', type: 'action' },
    { step: 2, action: 'Hot lead?', tool: 'ai condition', app: 'ai', output: '', type: 'condition', branches: [
      { key: 'true', steps: [{ step: 3, action: 'Notify sales', tool: 'slack channel', app: 'slack', appAction: 'send', output: '', type: 'channel' }] },
      { key: 'false', steps: [{ step: 4, action: 'Add to list', tool: 'mailchimp action', app: 'mailchimp', appAction: 'add', output: '', type: 'action' }] } ] },
    { step: 5, action: 'Send follow-up', tool: 'gmail action', app: 'gmail', appAction: 'send', output: '', type: 'action' },
  ]
  const build = (steps: any[]) => convertToN8nWorkflow({ workflow_id: 'x', title: 't', trigger: 'Every day', trigger_app: 'schedule', steps, keepLastStepIntent: true } as any)
  const joins = (wf: any) => wf.nodes.filter((n: any) => n.type === 'n8n-nodes-base.noOp').length

  it('branches rejoin by connecting straight into the next step (no join node)', () => {
    const wf: any = build(plan)
    expect(joins(wf)).toBe(0)
    const follow = wf.nodes.find((n: any) => /Send follow-up/.test(n.name)).name
    const sources = Object.entries(wf.connections).filter(([, v]: any) => v.main?.some((o: any[]) => o.some((c) => c.node === follow))).map(([k]) => k)
    expect(sources.length).toBe(2) // the tail of each branch
  })

  it('does not add a join step when the canvas is read back', () => {
    const wf = build(plan)
    const steps = canvasToGeneratedWorkflow(wf as any).steps
    const flat = JSON.stringify(steps)
    expect(flat).not.toMatch(/Merge \d/)
    expect(steps.map((s) => s.title).slice(-1)).toEqual(['Send follow-up'])
  })

  it('stays at one join after repeated edits', () => {
    let wf = build(plan)
    for (let i = 0; i < 3; i++) {
      const gen = canvasToGeneratedWorkflow(wf as any)
      const toConv = (ss: any[]): any[] => ss.map((s) => ({ step: 0, action: s.title, tool: `${s.app || ''} ${s.type}`, app: s.app, output: '', type: s.type, branches: s.branches?.map((b: any) => ({ key: b.key, steps: toConv(b.steps) })) }))
      wf = convertToN8nWorkflow({ workflow_id: 'x', title: 't', trigger: 'Schedule Trigger', trigger_app: 'schedule', steps: toConv(gen.steps.slice(1)), keepLastStepIntent: true } as any)
    }
    expect(joins(wf)).toBe(0)
    expect(wf.nodes.length).toBe(build(plan).nodes.length)
  })
})

describe('canvas round trip — empty branch at the end', () => {
  const plan: any[] = [
    { step: 1, action: 'Read leads', tool: 'googlesheets action', app: 'googlesheets', appAction: 'read', output: '', type: 'action' },
    { step: 2, action: 'Hot lead?', tool: 'ai condition', app: 'ai', output: '', type: 'condition', branches: [
      { key: 'true', steps: [{ step: 3, action: 'Notify sales', tool: 'slack channel', app: 'slack', appAction: 'send', output: '', type: 'channel' }] },
      { key: 'false', steps: [] } ] },
  ]
  it('shows the else path as "Nothing to do" but does not hand it to the model as a step', () => {
    const wf: any = convertToN8nWorkflow({ workflow_id: 'x', title: 't', trigger: 'Every day', trigger_app: 'schedule', steps: plan, keepLastStepIntent: true } as any)
    expect(wf.nodes.some((n: any) => n.name === 'Nothing to do')).toBe(true)
    const steps = canvasToGeneratedWorkflow(wf).steps
    expect(JSON.stringify(steps)).not.toMatch(/Nothing to do/)
    expect(steps.some((s) => s.type === 'condition')).toBe(true)
  })
})

describe('mergeEditedNodes — an id reused for a different step', () => {
  // The edit engine kept the ids of a Drive backup canvas but replaced every
  // step: "Step 2: Check" (a Drive action) became a condition. Keeping the old
  // Drive node left no true/false handles, so the branch edges vanished and
  // "Process"/"Log" floated unconnected on the canvas.
  const drive = (id: string, name: string, x: number) =>
    ({ id, name, type: 'n8n-nodes-base.googleDrive', typeVersion: 3, position: [x, 0], parameters: {} })
  const backup = {
    name: 'Blank Workflow',
    nodes: [
      { id: 't', name: 'Schedule Trigger', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: [0, 0], parameters: {} },
      drive('r', 'Step 1: Read', 200), drive('c', 'Step 2: Check', 400), drive('p', 'Step 3: Process', 600), drive('l', 'Step 4: Log', 800),
    ],
    connections: {
      'Schedule Trigger': { main: [[{ node: 'Step 1: Read', type: 'main', index: 0 }]] },
      'Step 1: Read': { main: [[{ node: 'Step 2: Check', type: 'main', index: 0 }]] },
      'Step 2: Check': { main: [[{ node: 'Step 3: Process', type: 'main', index: 0 }]] },
      'Step 3: Process': { main: [[{ node: 'Step 4: Log', type: 'main', index: 0 }]] },
    },
  } as any

  it('rebuilds the replaced steps so every edge has its handle', async () => {
    const { generatedWorkflowToN8n } = await import('./copilotToN8n')
    const original = n8nToReactFlow(backup)
    const before = canvasToGeneratedWorkflow(backup)
    const edited = {
      ...before,
      steps: [
        { ...before.steps[0] },
        { id: 'r', type: 'action' as const, title: 'Read Google Sheets Data', app: 'google sheets', testable: true },
        {
          id: 'c', type: 'condition' as const, title: 'Check if Data Exists', testable: true,
          branches: [
            { key: 'true', label: 'Data Found', steps: [{ id: 'p', type: 'action' as const, title: 'Process Each Row', app: 'code', testable: true }] },
            { key: 'false', label: 'No Data', steps: [{ id: 'l', type: 'action' as const, title: 'Log Completion', app: 'code', testable: true }] },
          ],
        },
      ],
    }
    const rebuilt = n8nToReactFlow(generatedWorkflowToN8n(edited, { workflowId: 'x', title: 'Blank Workflow', keepLastStepIntent: true }) as any)
    const merged = mergeEditedNodes(original, rebuilt, {
      keepTrigger: true,
      idAliases: stepIdAliases(edited.steps, original.nodes, before.steps),
    })

    // No Drive node survives in a slot that is now Sheets / IF / Code.
    expect(merged.nodes.some((n) => n.data.rawN8n?.type === 'n8n-nodes-base.googleDrive')).toBe(false)
    const check = merged.nodes.find((n) => /check if data exists/i.test(n.data.title))!
    expect(check.data.rawN8n.type).toBe('n8n-nodes-base.if')
    // Both branches still leave the IF node.
    expect(merged.edges.filter((e) => e.source === check.id).length).toBe(2)
    const ids = new Set(merged.nodes.map((n) => n.id))
    expect(merged.edges.every((e) => ids.has(e.source) && ids.has(e.target))).toBe(true)

    const d = diffSteps(before.steps, edited.steps)
    expect(d.kept + d.renamed).toBe(1) // only the trigger
  })
})

describe('reconcileEditedIds', () => {
  it('keeps ids of same-kind steps and remints reused, duplicate and invented ids', async () => {
    const { reconcileEditedIds } = await import('./canvasCopilot')
    const before = canvasToGeneratedWorkflow(driveBackup).steps
    let n = 0
    const edited = [
      before[0],
      { ...before[1], title: 'List invoices' }, // same kind -> kept
      { id: before[2].id, type: 'condition' as const, title: 'Check', testable: true }, // replaced -> new id
      { id: before[1].id, type: 'action' as const, title: 'Dup', app: 'google drive', testable: true }, // duplicate
      { id: 'llm-made', type: 'action' as const, title: 'New', app: 'slack', testable: true },
    ]
    const r = reconcileEditedIds(before, edited, () => `m${++n}`)
    expect(r.steps.map((s) => s.id)).toEqual([before[0].id, before[1].id, 'm1', 'm2', 'm3'])
    expect([r.kept, r.reminted]).toEqual([2, 3])
  })
})

describe('checkCanvasIntegrity / applyEditToCanvas', () => {
  const drive = (id: string, name: string, x: number) =>
    ({ id, name, type: 'n8n-nodes-base.googleDrive', typeVersion: 3, position: [x, 0], parameters: {} })
  const backup = {
    name: 'Blank Workflow',
    nodes: [
      { id: 't', name: 'Schedule Trigger', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: [0, 0], parameters: {} },
      drive('r', 'Step 1: Read', 200), drive('c', 'Step 2: Check', 400), drive('p', 'Step 3: Process', 600), drive('l', 'Step 4: Log', 800),
    ],
    connections: {
      'Schedule Trigger': { main: [[{ node: 'Step 1: Read', type: 'main', index: 0 }]] },
      'Step 1: Read': { main: [[{ node: 'Step 2: Check', type: 'main', index: 0 }]] },
      'Step 2: Check': { main: [[{ node: 'Step 3: Process', type: 'main', index: 0 }]] },
      'Step 3: Process': { main: [[{ node: 'Step 4: Log', type: 'main', index: 0 }]] },
    },
  } as any

  const driveToIf = async () => {
    const { generatedWorkflowToN8n } = await import('./copilotToN8n')
    const original = n8nToReactFlow(backup)
    const before = canvasToGeneratedWorkflow(backup)
    const edited = {
      ...before,
      steps: [
        { ...before.steps[0] },
        { id: 'r', type: 'action' as const, title: 'Read Google Drive Files', app: 'google drive', testable: true },
        {
          id: 'c', type: 'condition' as const, title: 'Check if Data Exists', testable: true,
          branches: [
            { key: 'true', label: 'Data Found', steps: [{ id: 'p', type: 'action' as const, title: 'Process Each Row', app: 'google drive', testable: true }] },
            { key: 'false', label: 'No Data', steps: [{ id: 'l', type: 'action' as const, title: 'Log Completion', app: 'google drive', testable: true }] },
          ],
        },
      ],
    }
    const rebuilt = n8nToReactFlow(generatedWorkflowToN8n(edited, { workflowId: 'x', title: 'Blank Workflow', keepLastStepIntent: true }) as any)
    // No `before.steps`: the alias map trusts the reused ids, like the model did before PR #215.
    return { original, rebuilt, idAliases: stepIdAliases(edited.steps, original.nodes) }
  }

  it('the Drive-backup-to-IF edit ends connected even with the shape guard bypassed', async () => {
    const { applyEditToCanvas } = await import('./canvasCopilot')
    const { original, rebuilt, idAliases } = await driveToIf()

    // Without the guard and the repair, the old Drive node sits in the IF slot.
    const raw = mergeEditedNodes(original, rebuilt, { keepTrigger: true, idAliases, checkOutputShape: false })
    const { checkCanvasIntegrity } = await import('./canvasCopilot')
    const rawIssues = checkCanvasIntegrity(raw.nodes, raw.edges)
    expect(rawIssues.some((i) => i.kind === 'missing-handle' && /check if data exists/i.test(i.title))).toBe(true)

    const r = applyEditToCanvas(original, rebuilt, { keepTrigger: true, idAliases, checkOutputShape: false })
    expect(r.issues).toEqual([])
    expect(r.reset).toEqual(['Check if Data Exists'])
    const check = r.nodes.find((n) => /check if data exists/i.test(n.data.title))!
    expect(check.data.rawN8n.type).toBe('n8n-nodes-base.if')
    expect(r.edges.filter((e) => e.source === check.id).length).toBe(2)
    // Downstream Drive steps keep their original nodes — only the culprit is reset.
    const process = r.nodes.find((n) => /process each row/i.test(n.data.title))!
    expect(r.keptIds.get(process.id)).toBe('p')
  })

  it('repairs a kept node that lacks the handle an edge uses', async () => {
    const { applyEditToCanvas } = await import('./canvasCopilot')
    const node = (id: string, title: string, extra: Record<string, unknown> = {}) =>
      ({ id, type: 'workflowStep', position: { x: 0, y: 0 }, data: { title, label: title, ...extra } }) as any
    const original = {
      nodes: [
        node('o-t', 'Trigger', { rawN8n: { type: 'n8n-nodes-base.manualTrigger' } }),
        node('o-x', 'Route', { rawN8n: { type: 'n8n-nodes-base.slack', parameters: { channel: 'old' } } }),
      ],
      edges: [{ id: 'oe', source: 'o-t', target: 'o-x' }],
    }
    const next = {
      nodes: [
        node('n-t', 'Trigger', { rawN8n: { type: 'n8n-nodes-base.manualTrigger' } }),
        node('n-x', 'Route', {
          rawN8n: { type: 'n8n-nodes-base.slack' }, // same shape as the original, so the guard keeps it
          outputs: [{ id: 'out-yes', label: 'Yes' }, { id: 'out-no', label: 'No' }],
        }),
        node('n-a', 'A'),
        node('n-b', 'B'),
      ],
      edges: [
        { id: 'e1', source: 'n-t', target: 'n-x' },
        { id: 'e2', source: 'n-x', target: 'n-a', sourceHandle: 'out-yes' },
        { id: 'e3', source: 'n-x', target: 'n-b', sourceHandle: 'out-no' },
      ],
    }
    const r = applyEditToCanvas(original, next, { keepTrigger: true })
    expect(r.issues).toEqual([])
    expect(r.reset).toEqual(['Route'])
    const route = r.nodes.find((n) => n.id === 'n-x')!
    expect(route.data.outputs).toHaveLength(2)
    expect(r.keptIds.has('n-x')).toBe(false)
    expect(r.keptIds.get('n-t')).toBe('o-t')
  })

  it('reports dangling edges, missing handles and unreachable steps', async () => {
    const { checkCanvasIntegrity } = await import('./canvasCopilot')
    const node = (id: string, title: string, extra: Record<string, unknown> = {}) =>
      ({ id, type: 'workflowStep', position: { x: 0, y: 0 }, data: { title, label: title, ...extra } }) as any
    const nodes = [
      node('t', 'Trigger', { rawN8n: { type: 'n8n-nodes-base.scheduleTrigger' } }),
      node('a', 'Step 1: Send'),
      node('b', 'Step 2: Log'),
      node('m', 'Chat Model'),
    ]
    const edges = [
      { id: 'e1', source: 't', target: 'a' },
      { id: 'e2', source: 'a', target: 'ghost' },
      { id: 'e3', source: 'a', target: 'b', sourceHandle: 'out-yes' },
      { id: 'e4', source: 'm', target: 'a', type: 'aiSubConnection', targetHandle: 'ai_languageModel' },
    ]
    const issues = checkCanvasIntegrity(nodes, edges)
    expect(issues.map((i) => [i.kind, i.edgeId ?? i.nodeId])).toEqual([
      ['missing-node', 'e2'],
      ['missing-handle', 'e3'],
      ['unreachable', 'b'],
    ])
    expect(issues[2].title).toBe('Log')
    // No trigger -> reachability is not checked.
    expect(checkCanvasIntegrity(nodes.slice(1, 3), [])).toEqual([])
  })
})

describe('planCanvasEdit — preview and apply share one merge', () => {
  const drive = (id: string, name: string, x: number) =>
    ({ id, name, type: 'n8n-nodes-base.googleDrive', typeVersion: 3, position: [x, 0], parameters: {} })
  const backup = {
    name: 'Blank Workflow',
    nodes: [
      { id: 't', name: 'Schedule Trigger', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: [0, 0], parameters: {} },
      drive('r', 'Step 1: Read', 200), drive('c', 'Step 2: Check', 400), drive('p', 'Step 3: Process', 600),
    ],
    connections: {
      'Schedule Trigger': { main: [[{ node: 'Step 1: Read', type: 'main', index: 0 }]] },
      'Step 1: Read': { main: [[{ node: 'Step 2: Check', type: 'main', index: 0 }]] },
      'Step 2: Check': { main: [[{ node: 'Step 3: Process', type: 'main', index: 0 }]] },
    },
  } as any

  it('runs the connection check on the canvas that would be applied', async () => {
    const { planCanvasEdit } = await import('./canvasEditPlan')
    const snap = { ...n8nToReactFlow(backup), n8n: backup } as any
    const before = canvasToGeneratedWorkflow(backup)
    const edited = {
      ...before,
      steps: [
        { ...before.steps[0] },
        { id: 'r', type: 'action' as const, title: 'Read', app: 'google drive', testable: true },
        {
          id: 'c', type: 'condition' as const, title: 'Check if Data Exists', testable: true,
          branches: [
            { key: 'true', label: 'Yes', steps: [{ id: 'p', type: 'action' as const, title: 'Process', app: 'google drive', testable: true }] },
            { key: 'false', label: 'No', steps: [{ id: 'n', type: 'action' as const, title: 'Log Nothing Found', app: 'google drive', testable: true }] },
          ],
        },
      ],
    }
    const { merged, preview } = planCanvasEdit(snap, edited, { workflowId: 'x', title: 'Blank Workflow' })
    expect(preview.issues).toBe(merged.issues)
    expect(preview.reset).toBe(merged.reset)
    expect(merged.issues).toEqual([])
    expect(preview.steps).toBe(5)
    const check = merged.nodes.find((n) => /check if data exists/i.test(n.data.title))!
    expect(check.data.rawN8n.type).toBe('n8n-nodes-base.if')
    expect(merged.edges.filter((e) => e.source === check.id)).toHaveLength(2)
    // The canvas is not touched.
    expect(snap.nodes).toHaveLength(4)
  })
})

describe('connectionCheckSummary', () => {
  const issue = (kind: 'missing-handle' | 'unreachable', nodeId: string, message: string) =>
    ({ kind, nodeId, title: nodeId, message })

  it('says every step is connected when nothing is wrong', async () => {
    const { connectionCheckSummary } = await import('./canvasEditPlan')
    expect(connectionCheckSummary({ issues: [], reset: [], steps: 5 })).toEqual({ ok: true, headline: 'All 5 steps connected', lines: [] })
    expect(connectionCheckSummary({ issues: [], reset: [], steps: 1 }).headline).toBe('All 1 step connected')
  })

  it('names steps whose settings auto-repair resets, and still allows applying', async () => {
    const { connectionCheckSummary } = await import('./canvasEditPlan')
    const r = connectionCheckSummary({ issues: [], reset: ['Check if Data Exists'], steps: 5 })
    expect(r.ok).toBe(true)
    expect(r.headline).toBe('All 5 steps connected, with settings reset')
    expect(r.lines).toEqual(['Settings will be reset for "Check if Data Exists" so it stays connected.'])
  })

  it('lists each remaining problem once and blocks applying', async () => {
    const { connectionCheckSummary } = await import('./canvasEditPlan')
    const r = connectionCheckSummary({
      issues: [
        issue('missing-handle', 'c', '"Check" has no "out-yes" output.'),
        issue('missing-handle', 'c', '"Check" has no "out-yes" output.'),
        issue('unreachable', 'p', '"Process" is not connected to the trigger, so it would never run.'),
      ],
      reset: ['Read'],
      steps: 4,
    })
    expect(r.ok).toBe(false)
    expect(r.headline).toBe('2 connection problems — Update canvas is disabled. Ask Aether to fix it.')
    expect(r.lines).toEqual([
      '"Check" has no "out-yes" output.',
      '"Process" is not connected to the trigger, so it would never run.',
      'Settings will be reset for "Read" so it stays connected.',
    ])
  })
})

describe('CopilotStateMachine — approval message', () => {
  const tested = (canvasTarget: { workflowId: string; title: string } | null) => ({
    sessionId: 's', stage: 'TESTING' as const, userRequest: 'x', conversationHistory: [],
    generatedWorkflow: {
      workflowName: 'Drive backup', steps: [{ id: 't', type: 'trigger' as const, title: 'Schedule', testable: false }],
      estimate_hours: 0, automation_score: 0, summary: 'Backs up Drive.', nodeConfigs: [],
    },
    testResults: [
      { stepId: 'a', status: 'success', message: 'ok' },
      { stepId: 'b', status: 'skipped', message: 'no creds' },
    ],
    testAttempts: 1, userApprovals: { confirmedWorkflow: true, approvedTest: false, appliedToCanvas: false },
    lastMessage: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    canvasTarget,
  }) as any

  it('a canvas edit says only the new steps were sandbox-tested and points to the connection check', () => {
    const msg: string = (new CopilotStateMachine('s', tested({ workflowId: 'wf-1', title: 'Drive backup' })) as any).buildApprovalMessage(1)
    expect(msg).toContain('Sandbox tested the new steps: 1 succeeded, 1 skipped, out of 2.')
    expect(msg).toContain('not the merged canvas')
    expect(msg).toContain('connection check for "Drive backup" is shown in the panel')
    expect(msg).not.toContain('Sandbox testing complete')
  })

  it('a new workflow keeps the full sandbox wording', () => {
    const msg: string = (new CopilotStateMachine('s', tested(null)) as any).buildApprovalMessage(1)
    expect(msg).toContain('Sandbox testing complete! 1 succeeded, 1 skipped, out of 2 total steps.')
    expect(msg).not.toContain('connection check')
  })
})

describe('CopilotStateMachine — a near-total rewrite asks first', () => {
  const canvas = () => ({ workflowId: 'wf-1', title: 'Drive backup', workflow: canvasToGeneratedWorkflow(driveBackup) })
  beforeEach(() => { bridgeCalls.length = 0 })

  const rewrite = async () => {
    const m = new CopilotStateMachine('s1')
    const st = await m.processMessage('ubah total jadi rekap invoice dari Gmail ke Sheets', canvas())
    // Don't hit the sandbox from these tests.
    ;(m as any).runTests = vi.fn(async () => (m as any).state)
    return { m, st }
  }

  it('asks new or replace instead of going straight to confirmation', async () => {
    const { st } = await rewrite()
    expect(st.stage).toBe('AWAITING_CONFIRMATION')
    expect(st.pendingRewriteChoice).toBe(true)
    expect(st.lastMessage).toContain('This replaces every step of "Drive backup"')
    expect(st.lastMessage).toContain('Reply **new** to save it as a new workflow (recommended) or **replace** to overwrite it.')
  })

  it.each(['new', 'baru', 'yes', 'ok'])('"%s" saves it as a new workflow', async (reply) => {
    const { m } = await rewrite()
    const st = await m.processMessage(reply, canvas())
    expect(st.canvasTarget).toBeNull()
    expect(st.applyAsNew).toBe(true)
    expect(st.pendingRewriteChoice).toBe(false)
    expect((m as any).runTests).toHaveBeenCalledOnce()
  })

  it.each(['replace', 'ganti', 'timpa aja'])('"%s" keeps the canvas as the target', async (reply) => {
    const { m } = await rewrite()
    const st = await m.processMessage(reply, canvas())
    expect(st.canvasTarget).toEqual({ workflowId: 'wf-1', title: 'Drive backup' })
    expect(st.applyAsNew).toBe(false)
    expect((m as any).runTests).toHaveBeenCalledOnce()
  })

  it('a partial edit does not ask', async () => {
    const st = await new CopilotStateMachine('s1').processMessage('tambah step kirim notifikasi Slack di akhir', canvas())
    expect(st.pendingRewriteChoice).toBe(false)
    expect(st.lastMessage).not.toContain('replaces every step')
  })

  it('a new edit instead of a choice clears the question and re-checks', async () => {
    const { m } = await rewrite()
    const st = await m.processMessage('tambah step kirim notifikasi Slack di akhir', canvas())
    expect(bridgeCalls.filter((c) => c.op === 'edit')).toHaveLength(2)
    // The second edit kept the rewritten steps, so nothing new to ask.
    expect(st.pendingRewriteChoice).toBe(false)
    expect(st.canvasTarget?.workflowId).toBe('wf-1')
  })
})

describe('isNearTotalRewrite / matchRewriteChoice', () => {
  const s = (id: string, type: any = 'action') => ({ id, type, title: id, testable: true })
  it('needs at least two non-trigger steps, none kept', () => {
    expect(isNearTotalRewrite([s('t', 'trigger'), s('a'), s('b')], [s('t', 'trigger'), s('x'), s('y')])).toBe(true)
    expect(isNearTotalRewrite([s('t', 'trigger'), s('a'), s('b')], [s('t', 'trigger'), s('a'), s('y')])).toBe(false)
    expect(isNearTotalRewrite([s('t', 'trigger'), s('a')], [s('x')])).toBe(false)
  })
  it('reads short replies only', () => {
    expect(matchRewriteChoice('New')).toBe('new')
    expect(matchRewriteChoice('simpan baru')).toBe('new')
    expect(matchRewriteChoice('replace')).toBe('replace')
    expect(matchRewriteChoice('replace the gmail step with outlook please')).toBeNull()
    expect(matchRewriteChoice('yes')).toBeNull()
  })
})
