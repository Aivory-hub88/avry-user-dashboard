// lib/workflows/zeroclawWorkflowPlanner.ts
// Calls Zeroclaw to decompose natural language into workflow steps

const VPS_BRIDGE_URL = process.env.VPS_BRIDGE_URL || 'http://43.156.108.96:3003';

export interface WorkflowStep {
  id: string;
  title: string;
  type: string;
  description: string;
}

export interface WorkflowPlan {
  intent: string;
  steps: WorkflowStep[];
  rawResponse?: string;
}

const DECOMPOSE_INSTRUCTION = `You are a workflow architect. Decompose the following automation request into discrete workflow steps.

Return ONLY valid JSON in this exact format, no explanation:
{
  "intent": "brief description of what workflow does",
  "steps": [
    {
      "id": "step_1",
      "title": "Human readable step name",
      "type": "one of: trigger|schedule|webhook|email|database|http|ssh|ftp|compress|cleanup|filter|transform|messaging|respond|ai",
      "description": "what this step does"
    }
  ]
}

Rules:
- First step should always be a trigger (trigger, schedule, or webhook)
- Maximum 8 steps
- type must be one of the allowed values exactly
- Keep titles concise (3-6 words)

Automation request: `;

export async function planWorkflowFromNaturalLanguage(
  userInput: string
): Promise<WorkflowPlan> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  try {
    // /bridge/aira calls Zeroclaw directly via callZeroclawWithSkill
    // Only requires: message (no session_id, no organization_id)
    // Returns: { message, final_text, raw_agent_response, model, skill }
    const fullMessage = `${DECOMPOSE_INSTRUCTION}${userInput}`;

    const res = await fetch(`${VPS_BRIDGE_URL}/bridge/aira`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: fullMessage,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(
        `Zeroclaw planner failed (${res.status}): ${await res.text()}`
      );
    }

    const data = await res.json();
    // /bridge/aira returns: { message, final_text, raw_agent_response, model, skill }
    const rawText = data?.final_text || data?.message || data?.raw_agent_response || data?.response || '';

    // FIX: Remove extra backslashes
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(
        `Zeroclaw did not return valid JSON. Got: ${rawText.slice(0, 200)}`
      );
    }

    const plan: WorkflowPlan = JSON.parse(jsonMatch[0]);

    if (!plan.steps || !Array.isArray(plan.steps) || plan.steps.length === 0) {
      throw new Error('Zeroclaw returned empty steps array');
    }

    plan.steps = plan.steps.map((step, i) => ({
      ...step,
      id: step.id || `step_${i + 1}`,
    }));

    // Store raw response for debugging (confirms non-fallback path)
    plan.rawResponse = jsonMatch[0];

    return plan;
  } catch (err: any) {
    console.warn(
      '[zeroclawWorkflowPlanner] Zeroclaw failed, using fallback:',
      err.message
    );
    return fallbackPlan(userInput);
  } finally {
    clearTimeout(timer);
  }
}

function fallbackPlan(userInput: string): WorkflowPlan {
  const lower = userInput.toLowerCase();
  const steps: WorkflowStep[] = [];

  if (/schedule|cron|every|daily|hourly|weekly/.test(lower)) {
    steps.push({
      id: 'step_1',
      title: 'Schedule Trigger',
      type: 'schedule',
      description: 'Scheduled trigger',
    });
  } else if (/webhook|http.*trigger|on.*request/.test(lower)) {
    steps.push({
      id: 'step_1',
      title: 'Webhook Trigger',
      type: 'webhook',
      description: 'HTTP webhook trigger',
    });
  } else {
    steps.push({
      id: 'step_1',
      title: 'Manual Trigger',
      type: 'trigger',
      description: 'Manual trigger',
    });
  }

  let idx = 2;

  if (/mysql|postgres|database|sql|query/.test(lower)) {
    steps.push({
      id: `step_${idx++}`,
      title: 'Query Database',
      type: 'database',
      description: 'Query database',
    });
  }

  if (/email|smtp|mail|send.*mail/.test(lower)) {
    steps.push({
      id: `step_${idx++}`,
      title: 'Send Email',
      type: 'email',
      description: 'Send email notification',
    });
  }

  if (/slack|discord|telegram|message/.test(lower)) {
    steps.push({
      id: `step_${idx++}`,
      title: 'Send Message',
      type: 'messaging',
      description: 'Send messaging notification',
    });
  }

  if (/http|api|request|fetch/.test(lower)) {
    steps.push({
      id: `step_${idx++}`,
      title: 'HTTP Request',
      type: 'http',
      description: 'Make HTTP API call',
    });
  }

  if (/ssh|exec|command|server/.test(lower)) {
    steps.push({
      id: `step_${idx++}`,
      title: 'Execute Command',
      type: 'ssh',
      description: 'Run remote command',
    });
  }

  if (steps.length === 1) {
    steps.push({
      id: `step_${idx}`,
      title: 'Process Data',
      type: 'transform',
      description: 'Process and transform data',
    });
  }

  return {
    intent: userInput.slice(0, 100),
    steps,
    rawResponse: '[fallback]',
  };
}
