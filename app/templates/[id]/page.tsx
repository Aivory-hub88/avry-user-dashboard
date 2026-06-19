import { asset } from "@/lib/asset";
import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TEMPLATES } from "@/components/templates/template-data";
import TemplateCanvasPreview from "@/components/templates/TemplateCanvasPreview";
import AppIcon from "@/components/templates/AppIcon";
import { ChevronRight, Bookmark, Share } from "lucide-react";

export default async function TemplateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const template = TEMPLATES.find((t) => t.id === resolvedParams.id);

  if (!template) {
    notFound();
  }

  return (
    <div className="flex h-full w-full bg-transparent text-white">
      <div className="flex-1 flex flex-col h-full bg-transparent overflow-hidden">
        {/* Top Header / Breadcrumb */}
        <div className="h-16 flex items-center px-8">
          <Link href="/templates" className="text-white/50 hover:text-white transition-colors text-[13px]">
            Templates
          </Link>
          <ChevronRight className="w-4 h-4 mx-2 text-white/30" />
          <span className="text-white/90 text-[13px] font-medium">{template.title}</span>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-row overflow-hidden">
          {/* Left Metadata Pane (1/3) */}
          <div className="w-[380px] p-6 border-r border-white/5 overflow-y-auto">
            <h1 className="text-sm font-bold leading-tight mb-6 tracking-tight text-white/95">
              {template.title}
            </h1>

            {/* Actions */}
            <div className="flex items-center gap-3 mb-10">
              <button className="w-10 h-10 rounded-xl border border-white/10 flex items-center justify-center hover:bg-white/5 transition-colors">
                <Bookmark className="w-4 h-4 text-white/70" />
              </button>
              <button className="flex-1 h-10 rounded-xl border border-white/10 flex items-center justify-center gap-2 hover:bg-white/5 transition-colors">
                <Share className="w-4 h-4 text-white/70" />
                <span className="text-[13px] font-medium">Share</span>
              </button>
              <button className="flex-1 h-10 rounded-xl bg-white text-black font-medium text-[13px] hover:bg-white/90 transition-colors">
                Try it
              </button>
            </div>

            {/* Meta Info */}
            <div className="space-y-6 mb-10">
              {template.author && (
                <div>
                  <div className="text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-2">Created By</div>
                  <div className="flex items-center gap-2">
                    {template.author.avatar ? (
                      <img src={asset(template.author.avatar)} alt={template.author.name} className="w-6 h-6 rounded-full" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-white/10" />
                    )}
                    <span className="text-[13px] text-white/80">{template.author.name}</span>
                  </div>
                </div>
              )}
              
              {template.lastUpdated && (
                <div>
                  <div className="text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-1">Last Updated</div>
                  <div className="text-[13px] text-white/80">{template.lastUpdated}</div>
                </div>
              )}

              <div>
                <div className="text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-2">Categories</div>
                <div className="flex flex-wrap gap-2">
                  <div className="px-3 py-1 rounded-lg border border-white/10 text-[11px] text-white/70">
                    {template.category}
                  </div>
                  {template.apps.map(app => (
                    <div key={app} className="px-3 py-1 rounded-lg border border-white/10 text-[11px] text-white/70 capitalize">
                      {app}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Nodes List */}
            {template.nodesList && template.nodesList.length > 0 && (
              <div>
                <h3 className="text-[15px] font-medium mb-4">Nodes</h3>
                <div className="space-y-3">
                  {template.nodesList.map((node, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-5 h-5 flex items-center justify-center">
                        <AppIcon app={node.icon} />
                      </div>
                      <span className="text-[13px] text-white/90 font-medium">{node.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Canvas Pane (2/3) */}
          <div className="flex-1 flex flex-col p-8 overflow-y-auto">
            {/* React Flow Canvas */}
            <div className="w-full h-[500px] bg-[#353531] rounded-2xl border border-white/5 overflow-hidden mb-8 relative shadow-lg">
               <TemplateCanvasPreview template={template} />
            </div>

            {/* Description */}
            <div className="max-w-3xl">
              <p className="text-[14px] text-white/80 leading-relaxed whitespace-pre-wrap">
                {template.description}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
