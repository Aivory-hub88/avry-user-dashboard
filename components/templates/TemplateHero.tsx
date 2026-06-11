import React from "react";

export default function TemplateHero() {
  return (
    <div className="relative w-full rounded-[18px] overflow-hidden bg-[#3a3a36] p-8 md:p-12 mb-8 border border-white/5 shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
      {/* Background Gradient Mesh */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-[#b7cba6]/20 rounded-full blur-[100px]"></div>
        <div className="absolute top-1/2 right-12 w-80 h-80 bg-[#b7cba6]/10 rounded-full blur-[80px]"></div>
        <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-white/5 rounded-full blur-[80px]"></div>
      </div>

      <div className="relative z-10 max-w-2xl">
        <h1 className="text-3xl md:text-4xl font-semibold text-white mb-4 tracking-tight">
          Explore templates by use case
        </h1>
        <p className="text-[#a1a1aa] text-base md:text-lg font-light leading-relaxed">
          Discover templates for your needs and get started with automation—no coding required.
        </p>
      </div>
    </div>
  );
}
