import type { WorkflowNodeData, NodeConfig } from '@/types/workflow-node';

/** Extract a typed NodeConfig from node data, mapping rawN8n params or using defaults */
export function extractConfigFromNode(data: WorkflowNodeData): NodeConfig {
  if (data.config?.type) return data.config;

  const n8nType = data.rawN8n?.type;
  const p = data.rawN8n?.parameters ?? {};

  switch (n8nType) {
    case 'n8n-nodes-base.httpRequest':
      return {
        type: 'httpRequest', method: p.method ?? 'GET', url: p.url ?? '',
        authentication: 'none', authFields: {}, sendHeaders: !!p.sendHeaders,
        headers: (p.headerParameters?.parameters ?? []).map((h: any) => ({ key: h.name, value: h.value })),
        sendQuery: !!p.sendQuery,
        queryParams: (p.queryParameters?.parameters ?? []).map((q: any) => ({ key: q.name, value: q.value })),
        sendBody: !!p.sendBody, bodyType: p.contentType ?? 'json', body: p.body ?? '',
      };
    case 'n8n-nodes-base.webhook':
      return { type: 'webhook', httpMethod: p.httpMethod ?? 'GET', path: p.path ?? '/', respondWith: p.responseMode ?? 'immediately' };
    case 'n8n-nodes-base.scheduleTrigger':
      return { type: 'schedule', interval: p.rule?.interval?.[0]?.field1 ?? 1, unit: p.rule?.interval?.[0]?.field2 ?? 'hours', timezone: p.timezone ?? 'UTC' };
    case 'n8n-nodes-base.manualTrigger':
      return { type: 'manualTrigger' };
    case 'n8n-nodes-base.if':
      return {
        type: 'ifCondition',
        conditions: (p.conditions?.boolean ?? []).map((c: any) => ({ field: c.value1 ?? '', operator: c.operation ?? 'equals', value: c.value2 ?? '' })),
        combinator: p.combineOperation ?? 'AND',
      };
    case 'n8n-nodes-base.set':
      return { type: 'editFields', fields: (p.values?.string ?? []).map((v: any) => ({ key: v.name ?? '', value: v.value ?? '' })) };
    case 'n8n-nodes-base.respondToWebhook':
      return { type: 'httpResponse', statusCode: p.statusCode ?? 200, responseBody: p.responseBody ?? '' };
    default:
      if (data.category === 'ai') {
        return { type: 'aiStep', whatHappens: data.title ?? '', model: 'gpt-4o', systemPrompt: '', temperature: 0.7, toolService: data.subtitle ?? '', expectedOutput: data.description ?? '' };
      }
      if (data.category === 'condition') {
        return { type: 'ifCondition', conditions: [{ field: '', operator: 'equals', value: '' }], combinator: 'AND' };
      }
      return { type: 'generic', name: data.title ?? '', description: data.description ?? '', fields: [] };
  }
}


/** Validate a config and return field→error map (empty = valid) */
export function validateConfig(config: NodeConfig): Record<string, string> {
  const errors: Record<string, string> = {};
  switch (config.type) {
    case 'httpRequest':
      if (!config.url) errors.url = 'URL is required';
      break;
    case 'webhook':
      if (!config.path) errors.path = 'Path is required';
      break;
    case 'schedule':
      if (!config.interval || config.interval < 1) errors.interval = 'Must be at least 1';
      break;
    case 'ifCondition':
      if (config.conditions.length === 0) errors.conditions = 'At least one condition required';
      break;
    case 'aiStep':
      if (!config.whatHappens) errors.whatHappens = 'Description is required';
      break;
  }
  return errors;
}

/** Get a human-readable type label for the node */
export function getNodeTypeLabel(data: WorkflowNodeData): string {
  const n8nType = data.rawN8n?.type;
  if (n8nType) {
    const map: Record<string, string> = {
      'n8n-nodes-base.httpRequest': 'HTTP Request',
      'n8n-nodes-base.webhook': 'Webhook Trigger',
      'n8n-nodes-base.scheduleTrigger': 'Schedule Trigger',
      'n8n-nodes-base.manualTrigger': 'Manual Trigger',
      'n8n-nodes-base.if': 'If / Switch',
      'n8n-nodes-base.set': 'Edit Fields',
      'n8n-nodes-base.respondToWebhook': 'HTTP Response',
    };
    if (map[n8nType]) return map[n8nType];
  }
  const catMap: Record<string, string> = {
    trigger: 'Trigger', action: 'Action', ai: 'AI Step', condition: 'Condition',
    channel: 'Channel', system: 'System', app: 'App',
  };
  return catMap[data.category] ?? 'Step';
}
