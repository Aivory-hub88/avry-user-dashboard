export type IntentRoute =
  | 'diagnostic'
  | 'blueprint'
  | 'workflow'
  | 'integration'
  | 'roadmap'
  | 'settings'
  | 'dashboard'
  | 'console'

export const INTENT_BOUNDARIES: Record<IntentRoute, { tabLabel: string; positive: string[]; negative: string[] }> = {
  diagnostic: {
    tabLabel: 'Diagnostic',
    positive: ['ai readiness', 'maturity', 'gap analysis', 'diagnose', 'assess', 'score', 'benchmark', 'current state', 'readiness assessment', 'evaluate', 'audit', 'review current'],
    negative: ['build', 'design', 'plan', 'configure', 'metrics', 'timeline', 'roadmap'],
  },
  blueprint: {
    tabLabel: 'Blueprint',
    positive: ['strategy', 'design', 'architect', 'framework', 'structure', 'ai strategy', 'system design', 'blueprint', 'transformation plan', 'plan', 'design system', 'architecture'],
    negative: ['current state', 'diagnostic', 'automate', 'pipeline', 'trigger'],
  },
  workflow: {
    tabLabel: 'Workflow',
    positive: ['automate', 'pipeline', 'trigger', 'process flow', 'orchestrate', 'run workflow', 'automation', 'recurring task', 'step by step', 'schedule task', 'repeat'],
    negative: ['high-level strategy', 'blueprint', 'api setup', 'vendor', 'diagnose', 'assess'],
  },
  integration: {
    tabLabel: 'Integration',
    positive: ['api', 'connect', 'integrate', 'vendor', 'plugin', 'webhook', 'sdk', 'third-party', 'tool setup', 'sync', 'endpoint', 'REST', 'GraphQL', 'OAuth'],
    negative: ['ongoing automation', 'workflow', 'ai strategy'],
  },
  roadmap: {
    tabLabel: 'AI Roadmap',
    positive: ['timeline', 'milestone', 'phase', 'quarter', 'priority', 'next steps', 'schedule', 'roadmap', 'phasing', 'planning', 'sprint', '12 months', 'yearly plan'],
    negative: ['strategy design', 'blueprint', 'current assessment'],
  },
  settings: {
    tabLabel: 'Settings',
    positive: ['configure', 'account', 'permission', 'access', 'user management', 'preference', 'toggle', 'settings', 'admin'],
    negative: ['business strategy', 'ai topics', 'roadmap'],
  },
  dashboard: {
    tabLabel: 'Dashboard',
    positive: ['metrics', 'kpi', 'overview', 'progress', 'status', 'performance', 'analytics', 'report', 'dashboard', 'summary', 'trend', 'chart', 'usage'],
    negative: ['future planning', 'roadmap', 'strategy', 'configure', 'settings'],
  },
  console: {
    tabLabel: 'Console',
    positive: ['general chat', 'unclear', 'fallback', 'help', 'explain'],
    negative: [],
  },
}