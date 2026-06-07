/**
 * AIRA Context Builder
 * Builds the `context` field passed to POST /api/aira/stream.
 * All AIRA traffic — console and floating tabs — goes through the single
 * canonical path: /api/aira/stream → /bridge/aira → Zeroclaw → OpenRouter.
 */

import type { AiryRoadmap } from '@/types/roadmap'

export type AiraSourceTab = 'console' | 'roadmap' | 'diagnostic' | 'workflow' | 'blueprint'
export type AiraMode = 'general' | 'roadmap_explain' | string

export interface AiraStreamContext {
  source_tab?: AiraSourceTab
  page?: AiraSourceTab | string
  mode?: AiraMode
  roadmap?: AiryRoadmap
  pageContext?: Record<string, unknown>
}

/**
 * Build the context object to include in the /api/aira/stream request body.
 * When page === 'roadmap', mode is set to 'roadmap_explain' and the full
 * AiryRoadmap object is attached. Other pages default to mode 'general'.
 */
export function buildAiraContext(params: {
  sourceTab?: AiraSourceTab
  pageContext?: Record<string, unknown>
  roadmap?: AiryRoadmap | null
}): AiraStreamContext {
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
