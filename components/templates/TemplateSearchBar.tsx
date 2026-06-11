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
    <div className="relative mb-10">
      <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
      </div>
      <input
        type="text"
        className="w-full bg-[#3a3a36] shadow-inner border border-white/5 rounded-xl py-4 pl-12 pr-4 text-white placeholder:text-[#a1a1aa] focus:outline-none focus:border-white/20 transition-colors text-[15px] font-light"
        placeholder="Search templates"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />
    </div>
  );
}
