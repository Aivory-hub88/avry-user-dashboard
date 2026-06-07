/**
 * TypeScript interfaces for the Aivory Dashboard
 */

export interface DiagnosticStatus {
  status: 'not_started' | 'in_progress' | 'completed'
  score?: number
  date?: string
  category?: string
}

export interface BlueprintStatus {
  status: 'none' | 'draft' | 'active'
  name?: string
  version?: string
  createdAt?: string
}

export interface WorkflowStatus {
  active: number
  total: number
  lastExecution?: string
}

export interface ActivityEvent {
  id: string
  type: 'diagnostic' | 'blueprint' | 'workflow' | 'execution'
  message: string
  timestamp: string
  metadata?: Record<string, any>
}

export interface DashboardData {
  diagnostic: DiagnosticStatus
  blueprint: BlueprintStatus
  workflows: WorkflowStatus
  recentActivity: ActivityEvent[]
}

export interface User {
  id: string
  email: string
  tier: 'free' | 'builder' | 'operator' | 'enterprise'
  credits: number
}

/**
 * Returns placeholder data for initial dashboard development
 */
export function getPlaceholderData(): DashboardData {
  return {
    diagnostic: {
      status: 'not_started'
    },
    blueprint: {
      status: 'none'
    },
    workflows: {
      active: 0,
      total: 0
    },
    recentActivity: [
      {
        id: '1',
        type: 'diagnostic',
        message: 'Welcome to Aivory! Start by running a diagnostic to assess your AI readiness.',
        timestamp: '2 minutes ago'
      }
    ]
  }
}
