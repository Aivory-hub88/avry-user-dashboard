"use client";

import React from "react";
import { TEMPLATE_CATEGORIES } from "./template-data";

export default function TemplatesSidebar({ 
  activeCategory, 
  setActiveCategory 
}: { 
  activeCategory: string, 
  setActiveCategory: (cat: string) => void 
}) {
  return (
    <div className="w-48 shrink-0 pr-6 border-r border-white/5 hidden md:block">
      <div className="mb-6 flex items-center justify-between text-white/90 text-[15px] font-medium px-3">
        <span>Categories</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 15l-6-6-6 6"/>
        </svg>
      </div>
      
      <div className="flex flex-col gap-1">
        {TEMPLATE_CATEGORIES.map((category) => {
          const isActive = category === activeCategory;
          return (
            <button
              key={category}
              onClick={() => setActiveCategory(category)}
              className={`text-left px-3.5 py-2.5 rounded-lg text-[13.5px] transition-all border ${
                isActive
                  ? "bg-[#b7cba6]/[0.12] border-[#b7cba6]/25 text-[#c9dab8] font-medium"
                  : "border-transparent text-[#a1a1aa] font-light hover:bg-white/[0.04] hover:text-white"
              }`}
            >
              {category}
            </button>
          );
        })}
      </div>
    </div>
  );
}
