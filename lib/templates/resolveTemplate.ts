import { TEMPLATES, Template } from "@/components/templates/template-data";
import { getToken } from "@/lib/auth";
import { asset } from "@/lib/asset";

// Map a backend template row (shared marketplace API) to the shape the UI expects.
// Mirrors the mapping in app/templates/page.tsx — keep the two in sync.
function mapBackendTemplate(t: any): Template {
  const wf = t.workflow_json;
  const hasFlow = wf && (Array.isArray(wf.nodes) || Array.isArray(wf.edges));
  return {
    id: t.id,
    title: t.name ?? t.title ?? "Untitled",
    description: t.description ?? "",
    uses: t.uses_count ?? t.uses ?? 0,
    apps: t.apps ?? [],
    category: t.category ?? "general",
    flowData: hasFlow ? wf : undefined,
  };
}

// Resolves a template by id: tries the backend marketplace first, then falls
// back to the local static catalog (same fallback the browse grid uses).
export async function fetchTemplateById(id: string): Promise<Template | null> {
  try {
    const token = getToken();
    const res = await fetch(asset("/api/templates"), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        const found = data.map(mapBackendTemplate).find((t) => t.id === id);
        if (found) return found;
      }
    }
  } catch {
    // fall through to static catalog
  }
  return TEMPLATES.find((t) => t.id === id) ?? null;
}

// Best-effort usage counter increment — never blocks applying the template.
export async function markTemplateUsed(id: string): Promise<void> {
  try {
    const token = getToken();
    if (!token) return;
    await fetch(asset(`/api/templates/${id}/use`), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // ignore — usage counter is non-critical
  }
}
