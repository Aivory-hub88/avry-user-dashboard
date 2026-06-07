export type WorkflowSource = 'n8n' | 'blueprint';
export type WorkflowStatus = 'active' | 'draft' | 'archived';

export interface ConsoleWorkflow {
  id: string;
  name: string;
  source: WorkflowSource;
  status: WorkflowStatus;
  createdAt?: string;
  updatedAt?: string;
  n8nId?: string;
  blueprintId?: string;
  description?: string;
}

// ── Aivory Workflow Spec (persisted via API) ─────────────

export interface AivoryWorkflowStep {
  step: number;
  action: string;
  tool: string;
  output: string;
  type?: string;
  appId?: string;          // links to AivoryApp.id
  connectionId?: string;   // links to AivoryConnection.id
  config?: {
    integration?: string;
    url?: string;
    method?: string;
    apiKey?: string;
    additionalFields?: string;
  };
  credentials?: {
    name?: string;
  };
}

export interface AivoryWorkflowSpec {
  id: string;                        // UUID
  title: string;
  status: WorkflowStatus;
  source: WorkflowSource;
  company_name: string;
  trigger: string;
  steps: AivoryWorkflowStep[];
  integrations: string[];
  estimated_time: string;
  automation_percentage: string;
  error_handling?: string;
  notes?: string;
  blueprintId?: string;
  n8nId?: string;
  // n8n mapping — set by the server after deploy; clients must NOT set these directly
  n8n_workflow_id?: string;          // n8n's internal workflow ID (e.g. "yQv9FEBFXKuNUgeO")
  n8n_url?: string;                  // n8n UI link: <N8N_BASE_URL>/workflow/<n8nWorkflowId>
  n8nWebhookPath?: string | null;    // relative webhook path returned by n8n, e.g. "/webhook/<uuid>"
  createdAt: string;
  updatedAt: string;
}

// ── Workflow Builder Types (for canvas-based workflow creation) ─────────────

/**
 * Represents a position on the workflow canvas
 */
export interface XYPosition {
  x: number;
  y: number;
}

/**
 * Represents a node on the workflow canvas
 * @property id - Unique identifier for the node (e.g., "node-1")
 * @property type - Type of node: trigger, app, ai, or logic
 * @property appId - Application identifier (for app nodes)
 * @property action - Selected action for the app (e.g., "send_message")
 * @property connectionId - ID of the attached integration connection
 * @property position - Canvas position coordinates
 * @property config - Action-specific configuration parameters
 * @property label - Display label for the node
 * @property data - Additional node data for rendering
 */
export interface WorkflowNode {
  id: string;
  type: 'trigger' | 'app' | 'ai' | 'logic';
  appId?: string;
  action?: string;
  connectionId?: string;
  position: XYPosition;
  config?: Record<string, any>;
  label?: string;
  data?: {
    appName?: string;
    appIcon?: string;
    connectionName?: string;
    [key: string]: any;
  };
}

/**
 * Represents an edge (connection) between two nodes on the workflow canvas
 * @property id - Unique identifier for the edge (e.g., "edge-1")
 * @property source - ID of the source node
 * @property target - ID of the target node
 * @property sourceHandle - Output handle ID on source node (for multi-output nodes)
 * @property targetHandle - Input handle ID on target node (for multi-input nodes)
 * @property animated - Whether the edge should animate during execution
 */
export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  animated?: boolean;
}

/**
 * Represents a saved integration connection/credential
 * @property id - Unique identifier for the connection
 * @property appId - Application this connection is for
 * @property displayName - User-friendly name for the connection
 * @property status - Connection status (connected, revoked, needs_reauth)
 * @property lastUsedAt - ISO timestamp of last usage
 */
export interface Connection {
  id: string;
  appId: string;
  displayName: string;
  status: 'connected' | 'revoked' | 'needs_reauth';
  lastUsedAt?: string;
}

/**
 * Represents data for an AI Agent node on the workflow canvas
 * @property type - Node type identifier: 'agent'
 * @property agentName - Name of the AI agent (required, max 100 chars)
 * @property agentIcon - Optional icon URL or SVG for the agent
 * @property model - LLM model name (required, e.g., "Claude 3.5", "GPT-4")
 * @property provider - LLM provider (required, e.g., "OpenRouter", "OpenAI")
 * @property runtime - Runtime environment (required, e.g., "Zeroclaw", "Local")
 * @property promptSummary - Truncated prompt summary (required, max 500 chars)
 * @property inputVariables - Array of input variable names (required, non-empty strings)
 * @property outputVariable - Output variable name (required, non-empty string)
 * @property status - Current node status (default, running, error, disabled)
 * @property errorMessage - Error message if status is 'error'
 * @property onDelete - Callback when delete button is clicked
 * @property onAddStep - Callback when add button is clicked
 * @property onExplainPath - Callback when info button is clicked
 */
export interface AgentNodeData {
  type: 'agent';
  agentName: string;
  agentIcon?: string;
  model: string;
  provider: string;
  runtime: string;
  promptSummary: string;
  inputVariables: string[];
  outputVariable: string;
  status?: 'default' | 'running' | 'error' | 'disabled';
  errorMessage?: string;
  onDelete?: () => void;
  onAddStep?: () => void;
  onExplainPath?: () => void;
}
