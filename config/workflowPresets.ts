/**
 * Workflow Extension Quick-Action Presets
 * 
 * Predefined instruction templates for common workflow patterns.
 * These are used in AddWithAiraPanel to provide quick shortcuts for users.
 */

import { WorkflowStep } from '@/types/workflows'

export interface QuickActionPreset {
  id: string
  label: string
  icon: string
  description: string
  getInstruction: (sourceStep: WorkflowStep) => string
}

/**
 * Build context-aware instruction based on source step type
 */
function buildSlackAlertInstruction(sourceStep: WorkflowStep): string {
  const isApiCall = sourceStep.appId === 'http' || sourceStep.appId === 'api'
  const isAiStep = sourceStep.type === 'ai'

  if (isApiCall) {
    return `Add a Slack notification step after this API call that only runs when the previous step fails. Include the error message in the notification.`
  }
  if (isAiStep) {
    return `Add a Slack notification step after this AI processing step that only runs when the previous step fails. Include the AI error details in the notification.`
  }
  return `Add a Slack notification step after this step that only runs when the previous step fails.`
}

function buildAuditLogInstruction(sourceStep: WorkflowStep): string {
  const isApiCall = sourceStep.appId === 'http' || sourceStep.appId === 'api'
  const isAiStep = sourceStep.type === 'ai'

  if (isApiCall) {
    return `Add a logging step after this API call that records the request URL, method, status code, and response time to our audit trail system.`
  }
  if (isAiStep) {
    return `Add a logging step after this AI processing step that records the input prompt, AI model used, and output to our audit trail system.`
  }
  return `Add a logging step after this step that records the key inputs and outputs to our audit trail system.`
}

function buildRetryInstruction(sourceStep: WorkflowStep): string {
  const isApiCall = sourceStep.appId === 'http' || sourceStep.appId === 'api'

  if (isApiCall) {
    return `Add a retry mechanism after this API call with up to 3 attempts and exponential backoff (1s, 2s, 4s) when it fails due to network errors or timeouts.`
  }
  return `Add a retry step after this step with up to 3 attempts and exponential backoff when it fails.`
}

function buildTimeoutAlertInstruction(sourceStep: WorkflowStep): string {
  const isApiCall = sourceStep.appId === 'http' || sourceStep.appId === 'api'

  if (isApiCall) {
    return `Add an email notification step that triggers if this API call takes longer than 30 seconds to complete. Include the step name and elapsed time in the email.`
  }
  return `Add an email notification step that triggers if this step takes longer than 30 seconds to complete.`
}

/**
 * Quick-action presets for common workflow patterns
 */
export const QUICK_ACTION_PRESETS: QuickActionPreset[] = [
  {
    id: 'slack-alert-on-failure',
    label: 'Slack alert on failure',
    icon: '',
    description: 'Notify Slack when this step fails',
    getInstruction: buildSlackAlertInstruction,
  },
  {
    id: 'audit-log',
    label: 'Log to audit trail',
    icon: '',
    description: 'Record inputs and outputs for compliance',
    getInstruction: buildAuditLogInstruction,
  },
  {
    id: 'retry-with-backoff',
    label: 'Retry with backoff',
    icon: '',
    description: 'Retry up to 3 times with exponential backoff',
    getInstruction: buildRetryInstruction,
  },
  {
    id: 'timeout-alert',
    label: 'Timeout alert',
    icon: '',
    description: 'Email if this step takes too long',
    getInstruction: buildTimeoutAlertInstruction,
  },
]

/**
 * Get a preset by ID
 */
export function getPresetById(id: string): QuickActionPreset | undefined {
  return QUICK_ACTION_PRESETS.find((p) => p.id === id)
}

/**
 * Get instruction for a preset
 */
export function getPresetInstruction(presetId: string, sourceStep: WorkflowStep): string | null {
  const preset = getPresetById(presetId)
  if (!preset) return null
  return preset.getInstruction(sourceStep)
}
