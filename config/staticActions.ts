/**
 * Static Actions Configuration for Suggestion Chips feature.
 *
 * These actions are shown on the console chat empty state (no message history).
 * They require zero LLM tokens — purely frontend-driven.
 * Data-driven: edit this array to change actions without modifying component logic.
 */

export interface StaticAction {
  id: string
  label: string
  icon: string // icon identifier used by ActionList component
}

export const STATIC_ACTIONS: StaticAction[] = [
  { id: 'run-diagnostic', label: 'Run Diagnostic', icon: 'diagnostic' },
  { id: 'generate-blueprint', label: 'Generate Blueprint', icon: 'blueprint' },
  { id: 'design-workflow', label: 'Design Workflow', icon: 'workflow' },
  { id: 'manage-integrations', label: 'Manage Integrations', icon: 'integrations' },
  { id: 'configure-agent', label: 'Configure Agent', icon: 'agent' },
]
