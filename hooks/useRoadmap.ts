import type { AiryRoadmap } from '@/types/roadmap';

const STORAGE_KEY = 'aivory_roadmap';

export function loadRoadmap(): AiryRoadmap | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AiryRoadmap;
  } catch {
    return null;
  }
}

export function saveRoadmap(roadmap: AiryRoadmap): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(roadmap));
  window.dispatchEvent(new Event('aivory_roadmap_updated'));

  // Async Supabase dual-write (Req 5.1) — fire-and-forget, does not block the caller
  import('@/lib/supabaseStorage').then(({ saveRoadmapToSupabase }) => {
    saveRoadmapToSupabase(roadmap, 'demo_org').catch((err) => {
      console.error('[useRoadmap] Supabase save failed:', err)
    })
  }).catch(() => { /* supabaseStorage unavailable */ })
}

export function clearRoadmap(): void {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event('aivory_roadmap_updated'));
}
