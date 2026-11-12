/**
 * Free analysis layout: the chat fills the content area like the Deep
 * Diagnostic (app/diagnostics/deep/layout.tsx). Deliberately outside
 * /diagnostics/deep, which is locked for free accounts (lib/freePreview.ts).
 */
export default function FreeAnalysisLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex-1 flex flex-col h-full min-w-0 overflow-y-auto">{children}</div>
}
