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
              className={`text-left px-3 py-2.5 rounded-lg text-[14px] font-light transition-all ${
                isActive 
                  ? "bg-white/10 text-white font-medium shadow-sm" 
                  : "text-[#a1a1aa] hover:bg-white/5 hover:text-white"
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
