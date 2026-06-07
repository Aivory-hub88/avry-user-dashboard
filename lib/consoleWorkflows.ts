import type { ConsoleWorkflow } from '@/types/workflow';

export async function createWorkflowFromBlueprint(params: {
  blueprintId: string;
  name?: string;
  context?: Record<string, any>;
}): Promise<ConsoleWorkflow> {
  const res = await fetch('/api/console/workflows/from-blueprint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const msg = body?.error || `Failed to create workflow (HTTP ${res.status})`;
    throw new Error(msg);
  }

  const json = await res.json();
  return json.data as ConsoleWorkflow;
}
