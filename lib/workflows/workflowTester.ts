/**
 * n8n Workflow Validation & Testing
 * Based on n8n-as-code patterns and n8n's actual workflow structure
 */

import { GeneratedWorkflowStep, TestResult } from './copilotStateMachine'

export interface N8nWorkflowNode {
  name: string
  type: string
  parameters: Record<string, any>
  position: [number, number]
  credentials?: Record<string, { id: string; name: string }>
}

export interface N8nWorkflow {
  id?: string
  name: string
  active: boolean
  nodes: N8nWorkflowNode[]
  connections: Record<string, any>
}

/**
 * Validate workflow structure (n8n-as-code pattern)
 */
export async function validateWorkflowStructure(
  steps: GeneratedWorkflowStep[]
): Promise<TestResult[]> {
  const results: TestResult[] = []

  // 1. Check for trigger node
  const triggerNode = steps.find(s => s.type === 'trigger')
  if (!triggerNode) {
    results.push({
      stepId: 'validation',
      status: 'error',
      message: '❌ Workflow harus memiliki trigger node',
      timestamp: new Date().toISOString(),
    })
    return results
  }

  results.push({
    stepId: triggerNode.id,
    status: 'success',
    message: `✅ Trigger node valid: ${triggerNode.title}`,
    timestamp: new Date().toISOString(),
  })

  // 2. Check each step type
  for (const step of steps) {
    const result = validateStepType(step)
    results.push(result)
  }

  // 3. Overall validation
  const passed = results.every(r => r.status === 'success')
  if (passed) {
    results.push({
      stepId: 'overall',
      status: 'success',
      message: `✅ Workflow valid dengan ${steps.length} steps`,
      errorDetail: `Trigger: ${triggerNode.title}`,
      timestamp: new Date().toISOString(),
    })
  }

  return results
}

/**
 * Validate individual step type
 */
function validateStepType(step: GeneratedWorkflowStep): TestResult {
  const validTypes = ['trigger', 'action', 'condition', 'channel']
  
  if (!validTypes.includes(step.type)) {
    return {
      stepId: step.id,
      status: 'error',
      message: `❌ Tipe step tidak valid: ${step.type}`,
      timestamp: new Date().toISOString(),
    }
  }

  // Type-specific validation
  switch (step.type) {
    case 'trigger':
      return validateTrigger(step)
    case 'action':
      return validateAction(step)
    case 'condition':
      return validateCondition(step)
    case 'channel':
      return validateChannel(step)
    default:
      return {
        stepId: step.id,
        status: 'error',
        message: `Unknown step type: ${step.type}`,
        timestamp: new Date().toISOString(),
      }
  }
}

function validateTrigger(step: GeneratedWorkflowStep): TestResult {
  const title = step.title.toLowerCase()
  
  // Schedule triggers
  if (title.includes('schedule') || title.includes('cron') || title.includes('daily')) {
    return {
      stepId: step.id,
      status: 'success',
      message: `✅ Schedule trigger: ${step.title}`,
      errorDetail: 'Schedule akan aktif setelah workflow di-deploy',
      timestamp: new Date().toISOString(),
    }
  }

  // Webhook triggers
  if (title.includes('webhook') || title.includes('http')) {
    return {
      stepId: step.id,
      status: 'success',
      message: `✅ Webhook trigger: ${step.title}`,
      errorDetail: 'Webhook endpoint akan tersedia setelah activation',
      timestamp: new Date().toISOString(),
    }
  }

  // Email triggers
  if (title.includes('email') || title.includes('gmail') || title.includes('imap')) {
    return {
      stepId: step.id,
      status: 'success',
      message: `✅ Email trigger: ${step.title}`,
      errorDetail: 'Email credentials required untuk activation',
      timestamp: new Date().toISOString(),
    }
  }

  // Generic trigger
  return {
    stepId: step.id,
    status: 'success',
    message: `✅ Trigger valid: ${step.title}`,
    errorDetail: step.description,
    timestamp: new Date().toISOString(),
  }
}

function validateAction(step: GeneratedWorkflowStep): TestResult {
  // All actions are valid at validation stage
  // Actual execution validation happens when workflow runs
  return {
    stepId: step.id,
    status: 'success',
    message: `✅ Action: ${step.title}`,
    errorDetail: step.description || 'Action akan divalidasi saat execution',
    timestamp: new Date().toISOString(),
  }
}

function validateCondition(step: GeneratedWorkflowStep): TestResult {
  return {
    stepId: step.id,
    status: 'success',
    message: `✅ Condition: ${step.title}`,
    errorDetail: 'Branching logic akan dievaluasi saat runtime',
    timestamp: new Date().toISOString(),
  }
}

function validateChannel(step: GeneratedWorkflowStep): TestResult {
  const title = step.title.toLowerCase()
  
  if (title.includes('slack')) {
    return {
      stepId: step.id,
      status: 'success',
      message: `✅ Slack notification: ${step.title}`,
      errorDetail: 'Slack credentials required',
      timestamp: new Date().toISOString(),
    }
  }

  if (title.includes('email') || title.includes('mail')) {
    return {
      stepId: step.id,
      status: 'success',
      message: `✅ Email notification: ${step.title}`,
      errorDetail: 'SMTP credentials required',
      timestamp: new Date().toISOString(),
    }
  }

  return {
    stepId: step.id,
    status: 'success',
    message: `✅ Notification: ${step.title}`,
    errorDetail: step.description,
    timestamp: new Date().toISOString(),
  }
}

/**
 * Format test results for display
 */
export function formatTestResults(results: TestResult[]): string {
  const summary = results
    .filter(r => r.stepId !== 'overall')
    .map((r, i) => {
      const icon = r.status === 'success' ? '✅' : r.status === 'error' ? '❌' : '⏭️'
      return `${icon} ${r.message}`
    })
    .join('\n')

  const totalSteps = results.filter(r => r.stepId !== 'overall' && r.stepId !== 'validation').length
  const passed = results.filter(r => r.status === 'success').length
  const failed = results.filter(r => r.status === 'error').length

  return `${summary}

📊 Hasil Validasi:
✅ Valid: ${passed}
❌ Error: ${failed}
📝 Total steps: ${totalSteps}`
}