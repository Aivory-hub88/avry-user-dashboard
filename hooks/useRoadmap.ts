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

  // Async per-user Postgres dual-write — fire-and-forget, does not block the caller
  import('@/lib/reportStorage').then(({ saveRoadmapRemote }) => {
    saveRoadmapRemote(roadmap).catch((err) => {
      console.error('[useRoadmap] server save failed:', err)
    })
  }).catch(() => { /* reportStorage unavailable */ })
}

export function clearRoadmap(): void {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event('aivory_roadmap_updated'));
}
