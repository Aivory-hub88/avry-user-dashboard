import React from "react";
import { Template } from "./template-data";
import AppIcon from "./AppIcon";
import Link from "next/link";

export default function TemplateCard({ template }: { template: Template }) {
  return (
    <Link href={`/templates/${template.id}`} className="block h-full">
      <div className="bg-[#3a3a36] border border-white/5 rounded-[16px] p-5 flex flex-col h-full hover:border-white/15 transition-colors group cursor-pointer shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
      {/* Header: Icons and Bookmark */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {template.apps.map((app, idx) => (
            <div key={idx} className="flex items-center justify-center drop-shadow-md">
              <AppIcon app={app} />
            </div>
          ))}
        </div>
        <button className="text-white/30 hover:text-white/70 transition-colors">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
          </svg>
        </button>
      </div>

      {/* Body: Title and Description */}
      <div className="flex-1 flex flex-col mb-4 mt-1">
        <div className="text-white text-[13.5px] font-semibold leading-snug mb-1.5 line-clamp-2">
          {template.title}
        </div>
        <div className="text-[#a1a1aa] text-[11.5px] font-light leading-relaxed line-clamp-2">
          {template.description}
        </div>
      </div>

      {/* Footer: Uses and Badge */}
      <div className="flex items-center justify-between mt-auto pt-4 border-t border-white/5">
        <div className="text-[10px] text-[#a1a1aa] font-light">
          {template.uses} uses
        </div>
        <div className="text-[9px] font-medium uppercase tracking-wider text-[#b7cba6] bg-[#b7cba6]/10 px-2 py-1 rounded-md border border-[#b7cba6]/20">
          AI-powered
        </div>
      </div>
      </div>
    </Link>
  );
}
