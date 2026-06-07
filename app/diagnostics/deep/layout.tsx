/**
 * Deep Diagnostic layout — renders full-screen without the app sidebar.
 * The diagnostic flow has its own phase navigator sidebar, so the app
 * sidebar would create a double-sidebar layout. This layout overrides
 * the root layout for all routes under /diagnostics/deep.
 */
export default function DeepDiagnosticLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex-1 flex flex-col h-full min-w-0 overflow-y-auto">
      {children}
    </div>
  )
}
