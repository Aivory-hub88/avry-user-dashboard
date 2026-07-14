import React from "react";
import { Template } from "./template-data";
import AppIcon from "./AppIcon";
import Link from "next/link";

export default function TemplateCard({ template }: { template: Template }) {
  return (
    <Link href={`/templates/${template.id}`} className="block h-full">
      <div className="bg-[#3a3a36] border border-white/[0.06] rounded-[16px] p-5 flex flex-col h-full transition-all duration-200 group cursor-pointer shadow-[0_4px_20px_rgba(0,0,0,0.2)] hover:-translate-y-1 hover:border-white/[0.12] hover:shadow-[0_12px_32px_rgba(0,0,0,0.35)]">
      {/* Header: Icons and Bookmark */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          {template.apps.map((app, idx) => (
            <div key={idx} className="w-7 h-7 rounded-lg bg-white/[0.05] ring-1 ring-white/[0.06] flex items-center justify-center shrink-0">
              <AppIcon app={app} />
            </div>
          ))}
        </div>
        <button className="text-white/30 hover:text-[#c9dab8] transition-colors">
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
      <div className="flex items-center justify-between mt-auto pt-4 border-t border-white/[0.06]">
        <div className="text-[10px] text-[#a1a1aa] font-light">
          {template.uses} uses
        </div>
        <div className="text-[9px] font-medium uppercase tracking-wider text-[#c9dab8] bg-[#b7cba6]/[0.12] px-2 py-1 rounded-md border border-[#b7cba6]/20">
          AI-powered
        </div>
      </div>
      </div>
    </Link>
  );
}
