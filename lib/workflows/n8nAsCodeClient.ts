/**
 * n8n-as-code-service client
 *
 * Thin wrapper around the n8n-as-code-service REST API (port 3500).
 * Used by copilot-test and copilot-apply API routes.
 */

// n8n-as-code-service runs on the VPS at port 3500.
// Set N8N_AS_CODE_URL in .env.local to override (e.g. for local dev tunnels).
const BASE_URL = process.env.N8N_AS_CODE_URL || 'http://43.156.108.96:3500';

async function n8nAsCodePost<T>(path: string, body: object, timeout = 45000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${path} failed (${res.status}): ${text}`);
    }

    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

export interface DraftBuildResult {
  draft_id: string;
  workflow_code_path: string;
  nodes_count: number;
  state: string;
}

export interface DraftTestResult {
  status: 'passed' | 'failed' | 'error';
  validationMode: 'real_execution';
  executionId?: string;
  nodeResults: Array<{
    nodeId: string;
    nodeName: string;
    status: 'success' | 'error';
    executionTime?: number | null;
    error?: string;
  }>;
  errors: string[];
  logs: string[];
}

export interface CredentialBindResult {
  draft_id: string;
  readyToDeploy: boolean;
  totalNodes: number;
  boundCount: number;
  missingCount: number;
  bindings: Array<{
    nodeId: string;
    nodeName: string;
    credentialName: string;
    credentialType: string;
  }>;
  missing: Array<{
    nodeId: string;
    nodeName: string;
    credentialType: string;
    action: string;
  }>;
  summary: string;
}

export interface DeployResult {
  draft_id: string;
  workflowId: string;
  activated: boolean;
  workflowUrl: string;
  boundCredentials: number;
  summary: string;
}

export const n8nAsCode = {
  build: (intent: string, steps: object[]) =>
    n8nAsCodePost<DraftBuildResult>('/drafts/build', { intent, steps }),

  test: (draft_id: string) =>
    n8nAsCodePost<DraftTestResult>('/drafts/test', { draft_id }, 45000),

  bindCredentials: (draft_id: string) =>
    n8nAsCodePost<CredentialBindResult>('/drafts/bind-credentials', { draft_id }),

  deploy: (draft_id: string, activate = true) =>
    n8nAsCodePost<DeployResult>('/drafts/deploy', { draft_id, activate }),

  report: (draft_id: string) =>
    n8nAsCodePost<object>('/drafts/report', { draft_id }),
};
