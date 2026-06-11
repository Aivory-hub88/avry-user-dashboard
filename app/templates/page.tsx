"use client";

import React, { useState, useMemo } from "react";
import TemplatesSidebar from "@/components/templates/TemplatesSidebar";
import TemplateHero from "@/components/templates/TemplateHero";
import TemplateSearchBar from "@/components/templates/TemplateSearchBar";
import TemplateGrid from "@/components/templates/TemplateGrid";
import { TEMPLATES, TEMPLATE_CATEGORIES } from "@/components/templates/template-data";

export default function TemplatesPage() {
  const [activeCategory, setActiveCategory] = useState("All Categories");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredTemplates = useMemo(() => {
    return TEMPLATES.filter((template) => {
      const matchesCategory =
        activeCategory === "All Categories" || template.category === activeCategory;
      const matchesSearch =
        template.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        template.description.toLowerCase().includes(searchQuery.toLowerCase());
      
      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, searchQuery]);

  return (
    <div className="flex h-full w-full bg-transparent text-white">
      {/* Sidebar for Categories */}
      <div className="p-6 h-full flex-shrink-0">
        <TemplatesSidebar 
          activeCategory={activeCategory} 
          setActiveCategory={setActiveCategory} 
        />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 md:p-8 lg:p-10">
        <div className="max-w-7xl mx-auto">
          {/* Breadcrumbs */}
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
