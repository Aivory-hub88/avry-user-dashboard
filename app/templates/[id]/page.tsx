"use client";

import { asset } from "@/lib/asset";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Template } from "@/components/templates/template-data";
import { fetchTemplateById, markTemplateUsed } from "@/lib/templates/resolveTemplate";
import TemplateCanvasPreview from "@/components/templates/TemplateCanvasPreview";
import AppIcon from "@/components/templates/AppIcon";
import { ChevronRight, Bookmark, Share } from "lucide-react";

export default function TemplateDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = (params?.id as string) || "";

  const [template, setTemplate] = useState<Template | null | undefined>(undefined);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!id) return;
    fetchTemplateById(id).then((t) => {
      if (!cancelled) setTemplate(t);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleTryIt = async () => {
    if (!template || applying) return;
    setApplying(true);
    markTemplateUsed(template.id);
    router.push(`/workflows?applyTemplate=${encodeURIComponent(template.id)}`);
  };

  if (template === undefined) {
    return (
      <div className="flex h-full w-full items-center justify-center text-white/40 text-[13px]">
        Loading template…
      </div>
    );
  }

  if (template === null) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-white/60">
        <p className="text-[13px]">Template not found.</p>
        <Link href="/templates" className="text-[12px] text-[#c9dab8] hover:underline">
          Back to templates
        </Link>
      </div>
    );
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
          <div className="w-[340px] p-5 border-r border-white/[0.06] overflow-y-auto">
            {/* NOTE: globals.css has an unlayered `main h1{...}` rule (30px/700) that
                beats any Tailwind class regardless of specificity — only an inline
                style can override it. Same applies to h2/h3/h4/p below. */}
            <h1
              className="text-white text-balance"
              style={{ fontSize: 17, fontWeight: 300, lineHeight: 1.3, letterSpacing: '-0.2px', margin: '0 0 16px', color: '#fff' }}
            >
              {template.title}
            </h1>

            {/* Actions */}
            <div className="flex items-center gap-2 mb-5">
              <button className="w-8 h-8 rounded-lg border border-white/[0.08] bg-white/[0.02] flex items-center justify-center hover:bg-white/[0.06] hover:border-white/[0.14] transition-all shrink-0">
                <Bookmark className="w-3.5 h-3.5 text-white/70" />
              </button>
              <button className="flex-1 h-8 rounded-lg border border-white/[0.08] bg-white/[0.02] flex items-center justify-center gap-1.5 hover:bg-white/[0.06] hover:border-white/[0.14] transition-all">
                <Share className="w-3.5 h-3.5 text-white/70" />
                <span className="text-[12px] font-medium text-white/80">Share</span>
              </button>
              <button
                onClick={handleTryIt}
                disabled={applying}
                className="flex-1 h-8 rounded-lg bg-gradient-to-b from-[#c9dab8] to-[#b7cba6] text-[#1c2318] font-semibold text-[12px] hover:brightness-105 active:brightness-95 transition-all shadow-[0_1px_0_rgba(255,255,255,0.4)_inset,0_4px_14px_rgba(183,203,166,0.25)] disabled:opacity-60"
              >
                {applying ? "Opening…" : "Try it"}
              </button>
            </div>

            {/* Meta Info */}
            <div className="space-y-4 mb-6 p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]">
              {template.author && (
                <div>
                  <div className="text-[9px] font-semibold text-white/35 uppercase tracking-wider mb-1.5">Created By</div>
                  <div className="flex items-center gap-2">
                    {template.author.avatar ? (
                      <img
                        src={asset(template.author.avatar)}
                        alt={template.author.name}
                        className={template.author.name === "Aivory Tech Lab" ? "h-6 w-auto object-contain brightness-0 invert opacity-90" : "w-5 h-5 rounded-full ring-1 ring-white/10"}
                      />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-white/10" />
                    )}
                    <span className="text-[12px] text-white/85 font-medium">{template.author.name}</span>
                  </div>
                </div>
              )}

              {template.lastUpdated && (
                <div>
                  <div className="text-[9px] font-semibold text-white/35 uppercase tracking-wider mb-1">Last Updated</div>
                  <div className="text-[12px] text-white/75">{template.lastUpdated}</div>
                </div>
              )}

              <div>
                <div className="text-[9px] font-semibold text-white/35 uppercase tracking-wider mb-1.5">Categories</div>
                <div className="flex flex-wrap gap-1.5">
                  <div className="px-2 py-1 rounded-full bg-[#b7cba6]/[0.12] border border-[#b7cba6]/20 text-[10px] text-[#c9dab8] font-medium">
                    {template.category}
                  </div>
                  {template.apps.map(app => (
                    <div key={app} className="px-2 py-1 rounded-full bg-white/[0.05] border border-white/[0.08] text-[10px] text-white/70 font-medium capitalize">
                      {app}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Nodes List */}
            {template.nodesList && template.nodesList.length > 0 && (
              <div>
                <h3
                  className="uppercase tracking-wider"
                  style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.4)', margin: '0 0 8px', lineHeight: 1.3 }}
                >Nodes</h3>
                <div className="space-y-1">
                  {template.nodesList.map((node, i) => (
                    <div key={i} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.045] hover:border-white/[0.08] transition-colors">
                      <div className="w-5 h-5 rounded-md bg-white/[0.05] flex items-center justify-center shrink-0 [&_img]:w-3.5 [&_img]:h-3.5 [&_svg]:w-3.5 [&_svg]:h-3.5">
                        <AppIcon app={node.icon} />
                      </div>
                      <span className="text-[12px] text-white/90 font-medium">{node.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Canvas Pane (2/3) */}
          <div className="flex-1 flex flex-col p-6 overflow-y-auto">
            {/* React Flow Canvas */}
            <div
              className="w-full h-[400px] rounded-xl border border-white/[0.06] overflow-hidden mb-6 relative shadow-[0_8px_28px_rgba(0,0,0,0.3)]"
              style={{
                background: [
                  'radial-gradient(ellipse 70% 60% at 25% 15%, rgba(183,203,166,0.05) 0%, transparent 55%)',
                  'radial-gradient(ellipse 60% 50% at 85% 85%, rgba(221,218,197,0.04) 0%, transparent 55%)',
                  'linear-gradient(160deg, #2f312b 0%, #26271f 100%)',
                ].join(', '),
              }}
            >
               <TemplateCanvasPreview template={template} />
            </div>

            {/* Description */}
            <div className="max-w-3xl">
              <h3
                className="uppercase tracking-wider"
                style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.4)', margin: '0 0 8px', lineHeight: 1.3 }}
              >About this template</h3>
              <p
                className="whitespace-pre-wrap"
                style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.75)', lineHeight: 1.6, margin: 0 }}
              >
                {template.description}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
