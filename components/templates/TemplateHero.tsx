import React from "react";
import { useTranslations } from "next-intl";
import GrainHeader from "@/components/ui/GrainHeader";

export default function TemplateHero() {
  const t = useTranslations("templates");
  return (
    <GrainHeader world="aubergine" className="w-full rounded-[18px] p-7 md:p-10 mb-8 shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
      <div className="relative z-10 max-w-2xl">
        <span className="inline-block text-[10px] font-semibold text-white/90 uppercase tracking-[0.12em] mb-3 px-2.5 py-[3px] rounded-full bg-white/[0.14] border border-white/[0.3] backdrop-blur-md">
          {t("badgeLabel")}
        </span>
        <h1
          className="text-white text-balance"
          style={{ fontSize: 26, fontWeight: 300, lineHeight: 1.25, letterSpacing: '-0.3px', margin: '0 0 10px', color: '#fff' }}
        >
          {t("heroTitle")}
        </h1>
        <p style={{ fontSize: 14, fontWeight: 300, color: 'rgba(255,255,255,0.85)', lineHeight: 1.6, margin: 0 }}>
          {t("heroSubtitle")}
        </p>
      </div>
    </GrainHeader>
  );
}
