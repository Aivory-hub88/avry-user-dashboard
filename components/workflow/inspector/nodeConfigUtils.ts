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
        sendBody: !!p.sendBody,
        bodyType: (p.contentType === 'form-urlencoded' ? 'form' : p.contentType) ?? 'json',
        body: p.jsonBody ?? p.body ?? '',
      };
    case 'n8n-nodes-base.webhook': {
      const respondWith = p.responseMode === 'onReceived' ? 'immediately'
        : p.responseMode === 'responseNode' ? 'respondToWebhookNode'
        : p.responseMode ?? 'immediately';
      const path = p.path ? (p.path.startsWith('/') ? p.path : `/${p.path}`) : '/';
      return { type: 'webhook', httpMethod: p.httpMethod ?? 'GET', path, respondWith };
    }
    case 'n8n-nodes-base.scheduleTrigger': {
      // Supports both the legacy synthetic shape (field1/field2) and the real
      // n8n shape ({ field: 'hours', hoursInterval: n }) written on deploy.
      const iv = p.rule?.interval?.[0] ?? {};
      const unit = iv.field2 ?? iv.field ?? 'hours';
      const interval = iv.field1 ?? iv[`${unit}Interval`] ?? 1;
      return { type: 'schedule', interval, unit, timezone: p.timezone ?? 'UTC' };
    }
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

// ── Deploy readiness ─────────────────────────────────────────

export interface DeployCheckItem {
  label: string;
  ok: boolean;
  /** 'error' blocks deploy, 'warn' is advisory */
  severity: 'error' | 'warn';
  hint?: string;
}

/**
 * Checklist of what this node still needs before the workflow can be
 * deployed to n8n. Drives the "Setup with Aivory" copilot panel.
 */
export function getDeployChecklist(config: NodeConfig, data: WorkflowNodeData): DeployCheckItem[] {
  const items: DeployCheckItem[] = [];
  const named = Boolean((data.title || data.label || '').trim());
  items.push({ label: 'Node has a descriptive name', ok: named, severity: 'warn', hint: 'Helps Aivory and n8n logs stay readable' });

  switch (config.type) {
    case 'httpRequest': {
      items.push({ label: 'Endpoint URL is set', ok: Boolean(config.url), severity: 'error', hint: 'n8n rejects HTTP Request nodes without a URL' });
      const authOk = config.authentication === 'none' || Object.values(config.authFields ?? {}).some(v => Boolean(v));
      items.push({
        label: config.authentication === 'none' ? 'No authentication (public API)' : `Credentials for ${config.authentication} filled`,
        ok: authOk,
        severity: config.authentication === 'none' ? 'warn' : 'error',
        hint: config.authentication === 'none' ? 'Fine for public APIs — add auth if the endpoint needs it' : 'Fill the credential fields before deploying',
      });
      if (config.sendBody && config.bodyType === 'json') {
        let jsonOk = true;
        try { if (config.body) JSON.parse(config.body); else jsonOk = false; } catch { jsonOk = false; }
        items.push({ label: 'Request body is valid JSON', ok: jsonOk, severity: 'error' });
      }
      break;
    }
    case 'webhook':
      items.push({ label: 'Webhook path is set', ok: Boolean(config.path && config.path !== '/'), severity: 'error', hint: 'e.g. /new-lead — becomes the n8n webhook URL' });
      break;
    case 'schedule':
      items.push({ label: 'Interval configured', ok: Boolean(config.interval && config.interval >= 1), severity: 'error' });
      items.push({ label: 'Timezone set', ok: Boolean(config.timezone), severity: 'warn', hint: 'Defaults to UTC if left empty' });
      break;
    case 'aiStep':
      items.push({ label: 'Step behaviour described', ok: Boolean(config.whatHappens), severity: 'error', hint: 'Aivory uses this to build the AI prompt' });
      items.push({ label: 'Model selected', ok: Boolean(config.model), severity: 'warn' });
      break;
    case 'ifCondition': {
      const hasCondition = config.conditions.length > 0 && config.conditions.some(c => Boolean(c.field));
      items.push({ label: 'At least one condition defined', ok: hasCondition, severity: 'error' });
      break;
    }
    case 'editFields':
      items.push({ label: 'At least one field mapping', ok: config.fields.length > 0 && config.fields.some(f => Boolean(f.key)), severity: 'error' });
      break;
    case 'httpResponse':
      items.push({ label: 'Status code set', ok: Boolean(config.statusCode), severity: 'error' });
      break;
    case 'manualTrigger':
      items.push({ label: 'Manual trigger — nothing to configure', ok: true, severity: 'warn' });
      break;
    case 'agent':
      items.push({ label: 'Agent linked', ok: Boolean((config as any).agentId || data.agentId), severity: 'error', hint: 'Pick which agent runs this step' });
      break;
    default: {
      // generic / app nodes
      if (data.category === 'app') {
        items.push({ label: 'App action selected', ok: Boolean((data as any).action), severity: 'error', hint: 'Choose what this app should do' });
        items.push({ label: 'Connection linked', ok: Boolean(data.connectionId), severity: 'warn', hint: 'Link a credential so n8n can authenticate' });
      } else {
        items.push({ label: 'Step description filled', ok: Boolean((config as any).description || data.description), severity: 'warn' });
      }
    }
  }
  return items;
}

/** True when no error-severity checklist item is failing. */
export function isDeployReady(config: NodeConfig, data: WorkflowNodeData): boolean {
  return getDeployChecklist(config, data).every(i => i.ok || i.severity === 'warn');
}

/** Short field summary of the current config, for compact display. */
export function summarizeConfig(config: NodeConfig): { key: string; value: string }[] {
  switch (config.type) {
    case 'httpRequest':
      return [
        { key: 'Method', value: config.method },
        { key: 'URL', value: config.url || '—' },
        { key: 'Auth', value: config.authentication },
        ...(config.sendBody ? [{ key: 'Body', value: config.bodyType }] : []),
      ];
    case 'webhook':
      return [{ key: 'Method', value: config.httpMethod }, { key: 'Path', value: config.path || '—' }];
    case 'schedule':
      return [{ key: 'Every', value: `${config.interval} ${config.unit}` }, { key: 'Timezone', value: config.timezone || 'UTC' }];
    case 'aiStep':
      return [{ key: 'Model', value: config.model || '—' }, { key: 'Does', value: config.whatHappens || '—' }];
    case 'ifCondition':
      return [{ key: 'Conditions', value: `${config.conditions.length} (${config.combinator})` }];
    case 'editFields':
      return [{ key: 'Fields', value: String(config.fields.length) }];
    case 'httpResponse':
      return [{ key: 'Status', value: String(config.statusCode) }];
    case 'manualTrigger':
      return [{ key: 'Trigger', value: 'Manual' }];
    default:
      return [];
  }
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
