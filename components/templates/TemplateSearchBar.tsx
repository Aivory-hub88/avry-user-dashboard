"use client";

import React from "react";

export default function TemplateSearchBar({ 
  searchQuery, 
  setSearchQuery 
}: { 
  searchQuery: string, 
  setSearchQuery: (query: string) => void 
}) {
  return (
    <div className="relative mb-6">
      <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8b8985" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
      </div>
      <input
        type="text"
        className="w-full bg-white/[0.03] shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)] border border-white/[0.07] rounded-lg py-2.5 pl-10 pr-4 text-white placeholder:text-[#8b8985] focus:outline-none focus:border-[#b7cba6]/35 focus:bg-white/[0.045] transition-all text-[13px] font-light"
        placeholder="Search templates"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />
    </div>
  );
}
