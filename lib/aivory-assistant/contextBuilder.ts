/**
 * Aivory Context Builder
 * Builds the `context` field passed to POST /api/aivory-assistant/stream.
 * All Aivory traffic — console and floating tabs — goes through the single
 * canonical path: /api/aivory-assistant/stream → /bridge/aivory-assistant → Zeroclaw → OpenRouter.
 */

import type { AiryRoadmap } from '@/types/roadmap'

export type AivorySourceTab = 'console' | 'roadmap' | 'diagnostic' | 'workflow' | 'blueprint'
export type AivoryMode = 'general' | 'roadmap_explain' | string

export interface AivoryStreamContext {
  source_tab?: AivorySourceTab
  page?: AivorySourceTab | string
  mode?: AivoryMode
  roadmap?: AiryRoadmap
  pageContext?: Record<string, unknown>
}

/**
 * Build the context object to include in the /api/aivory-assistant/stream request body.
 * When page === 'roadmap', mode is set to 'roadmap_explain' and the full
 * AiryRoadmap object is attached. Other pages default to mode 'general'.
 */
export function buildAivoryContext(params: {
  sourceTab?: AivorySourceTab
  pageContext?: Record<string, unknown>
  roadmap?: AiryRoadmap | null
}): AivoryStreamContext {
  const page = params.sourceTab ?? 'unknown'
  const isRoadmap = page === 'roadmap'
  return {
    source_tab: params.sourceTab,
    page,
    mode: isRoadmap ? 'roadmap_explain' : 'general',
    ...(isRoadmap && params.roadmap ? { roadmap: params.roadmap } : {}),
    pageContext: params.pageContext ?? {},
  }
}
