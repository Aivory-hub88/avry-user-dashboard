/** Small pieces shared by the CRM list tabs. Text lives in span/div only (see CrmApp). */
export function SamplePill() {
  return <span className="shrink-0 rounded-full bg-white/[0.08] px-1.5 py-px text-[10px] font-medium text-white/60">Sample</span>
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-line px-5 py-10 text-center text-[12px] text-white/40">{children}</div>
}
