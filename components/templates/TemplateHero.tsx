import React from "react";

export default function TemplateHero() {
  return (
    <div
      className="relative w-full rounded-2xl overflow-hidden p-6 md:p-8 mb-8 border border-white/[0.06] shadow-[0_8px_24px_rgba(0,0,0,0.25)]"
      style={{
        background: [
          'radial-gradient(ellipse 90% 120% at 10% 0%, rgba(183,203,166,0.14) 0%, transparent 55%)',
          'radial-gradient(ellipse 70% 90% at 92% 100%, rgba(221,218,197,0.09) 0%, transparent 55%)',
          'linear-gradient(135deg, #46483f 0%, #3a3c34 55%, #2c2e27 100%)',
        ].join(', '),
      }}
    >
      {/* Grain texture — matches the Agents hero treatment */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          opacity: 0.35,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E")`,
          mixBlendMode: 'soft-light',
        }}
      />

      <div className="relative z-10 max-w-2xl">
        <span className="inline-block text-[10px] font-semibold text-[#dddac5]/80 uppercase tracking-[0.12em] mb-3 px-2.5 py-[3px] rounded-full bg-white/[0.06] border border-white/[0.08]">
          Templates
        </span>
        {/* globals.css has an unlayered `main h1/p{...}` rule that beats any
            Tailwind class regardless of specificity — inline style is the only
            reliable override (see app/templates/[id]/page.tsx for the same fix). */}
        <h1
          className="text-white text-balance"
          style={{ fontSize: 22, fontWeight: 300, lineHeight: 1.25, letterSpacing: '-0.2px', margin: '0 0 10px', color: '#fff' }}
        >
          Explore templates by use case
        </h1>
        <p style={{ fontSize: 13, fontWeight: 300, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, margin: 0 }}>
          Discover templates for your needs and get started with automation—no coding required.
        </p>
      </div>

      {/* Decorative background glows */}
      <div className="absolute -bottom-16 -right-16 w-56 h-56 bg-[#b7cba6]/[0.07] rounded-full blur-3xl" />
    </div>
  );
}
