/**
 * LLM Response Parser for Suggestion Chips feature.
 *
 * Parses raw LLM text output into a structured response containing
 * the reply text, suggestion strings, and clarification flag.
 * Handles malformed JSON gracefully by falling back to raw text.
 */

export interface ParsedLLMResponse {
  reply: string
  suggestions: string[]
  isClarification: boolean
}

const MAX_SUGGESTIONS = 5

/**
 * Parses raw LLM output text into a structured ParsedLLMResponse.
 *
 * - If the input is valid JSON with a `reply` key, extracts reply, suggestions, and clarification.
 * - If the input is not valid JSON or missing the `reply` key, returns raw text as reply with empty suggestions.
 * - Filters non-string values from the suggestions array.
 * - Caps suggestions at a maximum of 5 items.
 */
export function parseLLMResponse(rawText: string): ParsedLLMResponse {
  console.log('[parseLLMResponse] rawText:', rawText.slice(0, 200))
  try {
    const parsed = JSON.parse(rawText)
    console.log('[parseLLMResponse] parsed JSON:', JSON.stringify(parsed))

    // Must be an object with a `reply` key
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed) ||
      !('reply' in parsed)
    ) {
      console.log('[parseLLMResponse] no reply key, returning rawText')
      return {
        reply: rawText,
        suggestions: [],
        isClarification: false,
      }
    }

    const reply = typeof parsed.reply === 'string' ? parsed.reply : String(parsed.reply)
    console.log('[parseLLMResponse] extracted reply:', reply.slice(0, 100))

    // Filter suggestions to strings only, then cap at MAX_SUGGESTIONS
    let suggestions: string[] = []
    if (Array.isArray(parsed.suggestions)) {
      suggestions = parsed.suggestions
        .filter((item: unknown): item is string => typeof item === 'string')
        .slice(0, MAX_SUGGESTIONS)
    }

    const isClarification = parsed.clarification === true

    return { reply, suggestions, isClarification }
  } catch {
    // JSON parse failed — return raw text as reply
    console.log('[parseLLMResponse] JSON parse failed, returning rawText')
    return {
      reply: rawText,
      suggestions: [],
      isClarification: false,
    }
  }
}

/**
 * Serializes a ParsedLLMResponse back to a JSON string.
 * Used for round-trip testing and potential re-serialization needs.
 */
export function formatLLMResponse(parsed: ParsedLLMResponse): string {
  const obj: Record<string, unknown> = {
    reply: parsed.reply,
    suggestions: parsed.suggestions,
  }

  if (parsed.isClarification) {
    obj.clarification = true
  }

  return JSON.stringify(obj)
}
