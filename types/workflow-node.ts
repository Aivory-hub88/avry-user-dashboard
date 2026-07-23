export type WorkflowNodeCategory =
  | 'trigger'
  | 'action'
  | 'ai'
  | 'condition'
  | 'channel'
  | 'system'
  | 'app';

export type WorkflowNodeVisualVariant =
  | 'primary'
  | 'secondary'
  | 'danger'
  | 'neutral';

export type WorkflowNodeData = {
  label?: string;       // display label (used by StandardNode)
  title: string;
  subtitle?: string;
  description?: string;
  category: WorkflowNodeCategory;
  variant?: WorkflowNodeVisualVariant;
  icon?: string;
  iconPath?: string;    // SVG path for app nodes
  appId?: string;       // links to AivoryApp.id
  connectionId?: string;
  // Agent node fields
  agentId?: string;     // links to Agent.id
  agentName?: string;   // cached agent name for display
  // Optional labels for connections, mainly for conditions
  outputs?: { id: string; label: string }[];
  // Raw n8n node object for deep debugging / mapping if needed
  rawN8n?: any;
  // Typed configuration for no-code inspector forms
  config?: NodeConfig;
  // Last test result from "Test this step"
  testResult?: TestStepResult | null;
  // Retry/error-handling — n8n models these as fields sibling to a node's
  // `parameters`, not part of them, so this lives outside `NodeConfig`
  // (which mirrors `parameters`) and applies to any node type uniformly.
  errorHandling?: NodeErrorHandling;
};

export interface NodeErrorHandling {
  retryOnFail?: boolean;
  maxTries?: number;
  waitBetweenTries?: number; // milliseconds
  onError?: 'stopWorkflow' | 'continueRegularOutput' | 'continueErrorOutput';
}

// ── Node Config Types (discriminated union) ──

export type NodeConfig =
  | HttpRequestConfig
  | WebhookConfig
  | ScheduleConfig
  | ManualTriggerConfig
  | AiStepConfig
  | IfConditionConfig
  | EditFieldsConfig
  | HttpResponseConfig
  | AgentConfig
  | RssFeedConfig
  | SlackConfig
  | GmailConfig
  | SwitchConfig
  | CodeConfig
  | GenericConfig;

export interface HttpRequestConfig {
  type: 'httpRequest';
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  authentication: 'none' | 'apiKey' | 'bearerToken' | 'basicAuth';
  authFields?: Record<string, string>;
  sendHeaders: boolean;
  headers: { key: string; value: string }[];
  sendQuery: boolean;
  queryParams: { key: string; value: string }[];
  sendBody: boolean;
  bodyType: 'json' | 'form' | 'raw';
  body: string;
}

export interface WebhookConfig {
  type: 'webhook';
  httpMethod: 'GET' | 'POST' | 'ANY';
  path: string;
  respondWith: 'immediately' | 'lastNode' | 'respondToWebhookNode';
}

export interface ScheduleConfig {
  type: 'schedule';
  interval: number;
  unit: 'minutes' | 'hours' | 'days' | 'weeks';
  startTime?: string;
  timezone: string;
}

export interface ManualTriggerConfig {
  type: 'manualTrigger';
}

export interface AiStepConfig {
  type: 'aiStep';
  whatHappens: string;
  /** Chat Model provider — determines which n8n LangChain sub-node gets deployed. */
  provider: 'openai' | 'anthropic';
  model: string;
  systemPrompt: string;
  temperature: number;
  toolService: string;
  expectedOutput: string;
}

export interface RssFeedConfig {
  type: 'rssFeed';
  feedUrl: string;
}

export interface SlackConfig {
  type: 'slack';
  resource: 'message';
  operation: 'send';
  channel: string;
  text: string;
  /** Bot token entered in Aivory — used to create a Slack credential in n8n at deploy time. Never persisted server-side by Aivory. */
  botToken: string;
}

export interface GmailConfig {
  type: 'gmail';
  to: string;
  subject: string;
  message: string;
}

export interface IfConditionConfig {
  type: 'ifCondition';
  conditions: { field: string; operator: string; value: string }[];
  combinator: 'AND' | 'OR';
}

export interface EditFieldsConfig {
  type: 'editFields';
  fields: { key: string; value: string }[];
}

export interface HttpResponseConfig {
  type: 'httpResponse';
  statusCode: number;
  responseBody: string;
}

export interface SwitchConfig {
  type: 'switch';
  /** n8n Switch v3 supports 'rules' (condition-based) and 'expression'
   *  (numeric-index) modes — the inspector only exposes 'rules' today. */
  mode: 'rules' | 'expression';
  rules: {
    outputKey: string;
    condition: { field: string; operator: string; value: string };
  }[];
  /** 'none' drops unmatched items; 'extra' routes them to one more output. */
  fallbackOutput: 'none' | 'extra';
}

export interface CodeConfig {
  type: 'code';
  language: 'javaScript' | 'python';
  mode: 'runOnceForAllItems' | 'runOnceForEachItem';
  code: string;
}

export interface GenericConfig {
  type: 'generic';
  name: string;
  description: string;
  fields: { key: string; value: string }[];
}

export interface AgentConfig {
  type: 'agent';
  agentName: string;
  model: string;
  provider: string;
  runtime: string;
  promptSummary: string;
  inputVariables: string[];
  outputVariable: string;
  status?: 'default' | 'running' | 'error' | 'disabled';
  errorMessage?: string;
}

export interface TestStepResult {
  success: boolean;
  output?: any;
  error?: string;
  executionTime?: number;
}
