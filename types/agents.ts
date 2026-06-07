/**
 * Agent Types & Interfaces
 * 
 * Defines the Agent entity for persistent AI agent configuration.
 * Agents can be referenced in workflow steps (type: 'agent').
 * 
 * Future phases will add:
 * - Advanced prompt configuration
 * - Tool/capability definitions
 * - Policy enforcement
 * - Execution history tracking
 */

export type AgentStatus = 'draft' | 'active' | 'disabled'

export type AgentProvider = 'openrouter' | 'openai' | 'anthropic' | 'other'

export type AgentRuntime = 'zeroclaw' | 'direct' | 'n8n'

/**
 * Agent entity — persistent configuration for AI agents
 * 
 * @interface Agent
 * @property {string} id - Unique identifier (UUID)
 * @property {string} workspaceId - Workspace/tenant identifier (multi-tenant scoping)
 * @property {string} name - Display name (1–100 chars)
 * @property {string} description - Short description of agent purpose
 * @property {string} model - Model identifier (e.g., "claude-3-5-sonnet", "gpt-4-turbo")
 * @property {AgentProvider} provider - LLM provider
 * @property {AgentRuntime} runtime - Execution runtime
 * @property {AgentStatus} status - Current status (draft, active, disabled)
 * @property {string} [slug] - URL-friendly slug (unique per workspace, optional for now)
 * @property {Record<string, any>} [config] - JSON config for future: prompt, tools, policies
 * @property {string[]} [tags] - Array of tags for organization
 * @property {string} createdAt - ISO timestamp
 * @property {string} updatedAt - ISO timestamp
 * @property {string | null} deletedAt - ISO timestamp for soft delete (null = not deleted)
 */
export interface Agent {
  id: string
  workspaceId: string
  name: string
  description: string
  model: string
  provider: AgentProvider
  runtime: AgentRuntime
  status: AgentStatus
  slug?: string
  config?: Record<string, any>
  tags?: string[]
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

/**
 * Request payload for creating an agent
 */
export interface CreateAgentRequest {
  name: string
  description?: string
  model: string
  provider: AgentProvider
  runtime?: AgentRuntime
  tags?: string[]
}

/**
 * Request payload for updating an agent
 */
export interface UpdateAgentRequest {
  name?: string
  description?: string
  model?: string
  provider?: AgentProvider
  runtime?: AgentRuntime
  status?: AgentStatus
  tags?: string[]
  config?: Record<string, any>
}

/**
 * Response payload for agent list/detail endpoints
 */
export interface AgentResponse extends Agent {}

/**
 * Paginated list response
 */
export interface AgentListResponse {
  agents: Agent[]
  total: number
  page: number
  pageSize: number
}
