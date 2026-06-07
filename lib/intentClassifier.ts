import { IntentRoute, INTENT_BOUNDARIES } from './intentBoundaries'

export type { IntentRoute }

export interface ClassifiedIntent {
  route: IntentRoute
  confidence: number
  reason: string
  tabLabel: string
  isLowConfidence?: boolean
}

const CONFIDENCE_THRESHOLD = 0.75

const FALLBACK: ClassifiedIntent = {
  route: 'console',
  confidence: 0,
  reason: 'Staying in Console',
  tabLabel: 'Console',
}

function buildClassifierPrompt(userMessage: string, aiReply: string): string {
  const boundaryDefs = Object.entries(INTENT_BOUNDARIES).map(([route, def]) =>
    `${route.toUpperCase()} (label: "${def.tabLabel}")\nPositive: ${def.positive.join(', ')}\nNegative: ${def.negative.join(', ')}`
  ).join('\n\n')

  return `You are an intent classifier for Aivory Console.
Analyze user message and AI reply, then determine which Aivory tab is most relevant.

TAB DEFINITIONS:
${boundaryDefs}

USER MESSAGE: ${userMessage}
AI REPLY: ${aiReply.slice(0, 400)}

RULES:
- Respond ONLY with valid JSON. No markdown, no code fences.
- If confidence < ${CONFIDENCE_THRESHOLD} or intent unclear, route to "console".
- reason = max 8 words, banner copy style.

JSON SHAPE:
{
  "route": "<route>",
  "confidence": <0.0-1.0>,
  "reason": "<max 8 words>",
  "tabLabel": "<display name>"
}`
}

export async function classifyIntent(userMessage: string, aiReply: string): Promise<ClassifiedIntent> {
  try {
    console.log('[IntentClassifier] START — userMessage:', userMessage.slice(0, 100), '| aiReply:', aiReply.slice(0, 100))
    
    const prompt = buildClassifierPrompt(userMessage, aiReply)
    console.log('[IntentClassifier] LOG #1 — prompt built, length:', prompt.length)
    
    const response = await fetch(`/api/intent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: prompt,
        context: { endpoint: 'intent-classifier' },
      }),
      signal: AbortSignal.timeout(5000),
    })

    console.log('[IntentClassifier] LOG #2 — response status:', response.status, response.statusText)

    if (!response.ok) {
      console.log('[IntentClassifier] response tidak ok:', response.status)
      return FALLBACK
    }

    const data = await response.json()
    console.log('[IntentClassifier] LOG #3 — response data:', JSON.stringify(data).slice(0, 200))
    
    const raw: string = data?.rawagentresponse ?? data?.response ?? ''
    console.log('[IntentClassifier] LOG #3b — extracted raw field:', raw.slice(0, 100))
    
    if (!raw || raw.length < 10) {
      console.log('[IntentClassifier] raw response too short or empty, returning FALLBACK')
      return FALLBACK
    }
    
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```$/i, '').trim()
    console.log('[IntentClassifier] LOG #3c — cleaned response:', cleaned.slice(0, 100))
    
    let parsed: any
    try {
      parsed = JSON.parse(cleaned)
      console.log('[IntentClassifier] LOG #3d — parsed JSON:', JSON.stringify(parsed))
    } catch (parseErr) {
      console.log('[IntentClassifier] JSON parse failed:', parseErr, '| raw was:', cleaned.slice(0, 200))
      return FALLBACK
    }

    const validRoutes: IntentRoute[] = ['diagnostic', 'blueprint', 'workflow', 'integration', 'roadmap', 'settings', 'dashboard', 'console']

    console.log('[IntentClassifier] LOG #4 — sebelum threshold check, intent:', parsed?.route, '| confidence:', parsed?.confidence, '| threshold:', CONFIDENCE_THRESHOLD)

    if (
      !validRoutes.includes(parsed?.route) ||
      typeof parsed?.confidence !== 'number' ||
      parsed.confidence < 0 ||
      parsed.confidence > 1 ||
      typeof parsed?.reason !== 'string'
    ) {
      console.log('[IntentClassifier] validation failed, returning FALLBACK')
      return FALLBACK
    }

    // Return all intents regardless of confidence - let UI layer decide how to handle low confidence
    console.log('[IntentClassifier] ✅ set pendingRoute →', parsed.route, '| confidence:', parsed.confidence)
    return {
      route: parsed.route as IntentRoute,
      confidence: parsed.confidence,
      reason: parsed.reason.slice(0, 60),
      tabLabel: parsed.tabLabel ?? INTENT_BOUNDARIES[parsed.route as IntentRoute].tabLabel,
      isLowConfidence: parsed.confidence < CONFIDENCE_THRESHOLD,
    }
  } catch (err) {
    console.log('[IntentClassifier] catch error:', err)
    return FALLBACK
  }
}