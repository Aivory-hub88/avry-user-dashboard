"use client";

import React, { useState, useMemo, useEffect } from "react";
import TemplatesSidebar from "@/components/templates/TemplatesSidebar";
import TemplateHero from "@/components/templates/TemplateHero";
import TemplateSearchBar from "@/components/templates/TemplateSearchBar";
import TemplateGrid from "@/components/templates/TemplateGrid";
import { TEMPLATES as FALLBACK_TEMPLATES } from "@/components/templates/template-data";
import { getToken } from "@/lib/auth";

// Map a backend template row to the shape the UI components expect.
function mapTemplate(t: any) {
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

export default function TemplatesPage() {
  const [activeCategory, setActiveCategory] = useState("All Categories");
  const [searchQuery, setSearchQuery] = useState("");
  const [templates, setTemplates] = useState<any[]>(FALLBACK_TEMPLATES);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = getToken();
        const res = await fetch("/dashboard/api/templates", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return;
        const data = await res.json();
        const mapped = Array.isArray(data) ? data.map(mapTemplate) : [];
        if (!cancelled && mapped.length) setTemplates(mapped);
      } catch {
        // keep fallback templates
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredTemplates = useMemo(() => {
    return templates.filter((template) => {
      const matchesCategory =
        activeCategory === "All Categories" || template.category === activeCategory;
      const matchesSearch =
        template.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        template.description.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [templates, activeCategory, searchQuery]);

  return (
    <div className="flex h-full w-full bg-transparent text-white">
      <div className="p-6 h-full flex-shrink-0">
        <TemplatesSidebar
          activeCategory={activeCategory}
          setActiveCategory={setActiveCategory}
        />
      </div>

      <div className="flex-1 overflow-y-auto p-6 md:p-8 lg:p-10">
        <div className="max-w-7xl mx-auto">
          <div className="text-[13px] font-light text-[#a1a1aa] mb-6 flex items-center gap-2">
            <span>Discover</span>
            <span>/</span>
            <span className="text-white">{activeCategory}</span>
          </div>

          <TemplateHero />

          <TemplateSearchBar
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
          />

          <TemplateGrid templates={filteredTemplates} />
        </div>
      </div>
    </div>
  );
}
